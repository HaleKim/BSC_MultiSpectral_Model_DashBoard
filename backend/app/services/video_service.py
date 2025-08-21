# /backend/app/services/video_service.py (사용자님 코드 기반 최종 수정본)

# OpenCV를 가장 먼저 임포트하여 비디오 백엔드 초기화 우선순위 확보
import cv2
import numpy as np
import base64
import time
import os
import threading
from collections import deque
from datetime import datetime
import json
from concurrent.futures import ThreadPoolExecutor

# OpenH264 DLL 경로 설정 제거 (버전 호환성 문제로 인해)
# 호환되는 openh264-2.3.1-win64.dll을 python.exe와 동일한 폴더에 배치하면
# OpenCV가 자동으로 인식하여 H.264 코덱을 사용할 수 있습니다.
print("INFO: OpenH264 지원 - 호환 DLL이 Python 폴더에 있으면 자동 인식됩니다.")

# Flask 관련 임포트
from flask import current_app
from ..extensions import socketio, db
from ..models.db_models import DetectionEvent, EventFile, Camera

# AI 관련 임포트는 마지막에
from ultralytics import YOLO
from ultralytics.nn.modules import conv

# --- 커스텀 AI 모델 클래스 등록 ---
try:
    from .custom_classes import Silence, SilenceChannel
    conv.Silence = Silence
    conv.SilenceChannel = SilenceChannel
    print("INFO: 커스텀 AI 모델 클래스가 성공적으로 등록되었습니다.")
except ImportError:
    print("경고: 커스텀 모델 .py 파일을 찾을 수 없습니다. 모델 로딩에 실패할 수 있습니다.")

def get_default_model_from_settings():
    """settings.json에서 기본 모델 이름을 읽어오는 함수"""
    try:
        import json
        # settings.json 경로를 정확하게 잡아줍니다.
        settings_path = os.path.join(os.path.dirname(__file__), '..', '..', 'settings.json')
        if os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                return settings.get('default_model', 'yolo11n_early_fusion.pt') # 파일이 있어도 키가 없으면 기본값
    except Exception:
        pass # 오류 발생 시 기본값 반환
    return 'yolo11n_early_fusion.pt'

# --- 전역 설정 ---
DEFAULT_MODEL_NAME = get_default_model_from_settings()
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'models_ai', DEFAULT_MODEL_NAME)
MODEL_TYPE = 'early_fusion'
RECORD_SECONDS_BEFORE = 10  # 이벤트 발생 이전 녹화 시간
RECORD_SECONDS_AFTER = 10   # 이벤트 발생 이후 녹화 시간
TOTAL_RECORD_SECONDS = RECORD_SECONDS_BEFORE + RECORD_SECONDS_AFTER  # 총 녹화 시간
FPS = 40
RECORDINGS_FOLDER = "event_recordings"

# --- 시험 영상 제어용 전역 변수 ---
test_video_controls = {}  # 클라이언트별 비디오 제어 상태 저장

def set_test_video_control(sid, action, **kwargs):
    """시험 영상 제어 상태 설정"""
    if sid not in test_video_controls:
        test_video_controls[sid] = {
            'is_paused': False,
            'current_time': 0.0,
            'playback_rate': 1.0,
            'seek_time': None
        }
    
    old_state = test_video_controls[sid].copy()
    
    if action == 'pause':
        test_video_controls[sid]['is_paused'] = True
        if 'time' in kwargs:
            test_video_controls[sid]['current_time'] = float(kwargs['time'])
    elif action == 'play':
        test_video_controls[sid]['is_paused'] = False
        if 'time' in kwargs:
            test_video_controls[sid]['current_time'] = float(kwargs['time'])
    elif action == 'seek':
        test_video_controls[sid]['seek_time'] = float(kwargs['time'])
        test_video_controls[sid]['current_time'] = float(kwargs['time'])
    elif action == 'playback_rate':
        old_rate = test_video_controls[sid]['playback_rate']
        new_rate = float(kwargs['rate'])
        test_video_controls[sid]['playback_rate'] = new_rate
        if old_rate != new_rate:
            print(f"[비디오 제어] 재생 속도 변경: {old_rate}x -> {new_rate}x")
    
    print(f"[비디오 제어] 클라이언트 {sid}: {action}, 상태: {test_video_controls[sid]}")

def get_test_video_control(sid):
    """시험 영상 제어 상태 조회"""
    return test_video_controls.get(sid, {
        'is_paused': False,
        'current_time': 0.0,
        'playback_rate': 1.0,
        'seek_time': None
    })

def clear_test_video_control(sid):
    """시험 영상 제어 상태 정리"""
    if sid in test_video_controls:
        del test_video_controls[sid]
        print(f"[비디오 제어] 클라이언트 {sid} 제어 상태 정리 완료")

# --- Confidence 임계값 설정 ---
PERSON_CONFIDENCE_THRESHOLD = 0.7  # 사람 탐지 임계값: 70% (BBox 표시 기준과 동일)
ANIMAL_CONFIDENCE_THRESHOLD = 0.7  # 동물 탐지 임계값: 70%
BBOX_DISPLAY_THRESHOLD = 0.7       # BBox 표시 임계값: 70%

# --- AI 모델 로드 ---
def load_model(model_name='yolo11n_early_fusion.pt'):
    """동적으로 모델을 로드하는 함수"""
    model_path = os.path.join(os.path.dirname(__file__), '..', '..', 'models_ai', model_name)
    try:
        loaded_model = YOLO(model_path)
        print(f"'{model_path}' 모델 로드 성공.")
        return loaded_model
    except Exception as e:
        print(f"모델 로드 실패: {e}")
        return None

# 기본 모델 로드
try:
    model = YOLO(MODEL_PATH)
    print(f"'{MODEL_PATH}' 기본 모델 로드 성공.")
except Exception as e:
    model = None
    print(f"기본 모델 로드 실패: {e}")


def transform_rgb_to_tir(frame_rgb):
    gray = cv2.cvtColor(frame_rgb, cv2.COLOR_BGR2GRAY)
    # frame_tir_color = cv2.applyColorMap(gray, cv2.COLORMAP_INFERNO)
    # return frame_tir_color, gray
    return gray

def save_video_clip(buffer, file_path, fps):
    """비디오 클립을 저장하고 실제 저장된 파일명을 반환"""
    print(f"[녹화 시작] 버퍼 크기: {len(buffer)} 프레임")
    if not buffer: 
        print("[녹화 실패] 버퍼가 비어있습니다.")
        return None
    
    recordings_dir = os.path.dirname(file_path)
    if not os.path.exists(recordings_dir): 
        os.makedirs(recordings_dir)
        print(f"[녹화] 디렉토리 생성: {recordings_dir}")
    
    height, width, _ = buffer[0].shape
    expected_duration = len(buffer) / fps if fps > 0 else 0
    print(f"[녹화] 프레임 크기: {width}x{height}, FPS: {fps:.2f}")
    print(f"[녹화] 예상 영상 길이: {expected_duration:.1f}초")
    
    # 웹 브라우저 최적화: H.264/MP4 형식을 최우선으로 설정
    # OpenH264 라이브러리를 통한 H.264 코덱 지원 (웹 표준)
    codec_combinations = [
        (cv2.VideoWriter_fourcc(*'H264'), '.mp4', 'H.264 MP4 (OpenH264)'),     # 1순위: H.264 표준
        (cv2.VideoWriter_fourcc(*'avc1'), '.mp4', 'H.264 AVC1 MP4'),           # 2순위: H.264 대안
        (cv2.VideoWriter_fourcc(*'mp4v'), '.mp4', 'MPEG-4 MP4'),               # 3순위: MPEG-4 백업
        # AVI는 웹 브라우저 <video> 태그에서 재생되지 않으므로 최후 백업으로만 유지
        (cv2.VideoWriter_fourcc(*'MJPG'), '.avi', 'Motion JPEG AVI (백업)'),    # 4순위: 최후 백업
    ]
    
    writer = None
    used_combination = None
    final_file_path = file_path
    
    # 각 조합을 순서대로 시도
    for fourcc, ext, description in codec_combinations:
        # 파일 확장자 변경
        base_path = os.path.splitext(file_path)[0]
        test_file_path = base_path + ext
        
        print(f"[녹화] {description} 시도 중... (파일: {os.path.basename(test_file_path)})")
        writer = cv2.VideoWriter(test_file_path, fourcc, fps, (width, height))
        
        if writer.isOpened():
            used_combination = (fourcc, ext, description)
            final_file_path = test_file_path
            print(f"[녹화] {description} 성공!")
            
            # H.264/MP4 성공 시 특별 로깅
            if 'H.264' in description and '.mp4' in description:
                print(f"[녹화] ✅ H.264/MP4 형식으로 저장됨 - 웹 브라우저 완벽 호환!")
            elif '.avi' in description:
                print(f"[녹화] ⚠️  AVI 형식으로 저장됨 - 웹 브라우저에서 재생되지 않을 수 있음")
            
            break
        else:
            print(f"[녹화] {description} 실패")
        writer.release()
    
    if not writer or not writer.isOpened():
        print(f"[녹화 실패] 모든 코덱 조합으로 VideoWriter를 열 수 없습니다: {file_path}")
        return None
    
    print(f"[녹화] 최종 사용된 형식: {used_combination[2]}")
    
    frame_count = 0
    for frame in list(buffer): 
        writer.write(frame)
        frame_count += 1
    
    writer.release()
    
    # 파일 크기 확인
    if os.path.exists(final_file_path):
        file_size = os.path.getsize(final_file_path)
        actual_duration = frame_count / fps if fps > 0 else 0
        print(f"[녹화 완료] 영상이 다음 경로에 저장되었습니다: {final_file_path}")
        print(f"[녹화 완료] 파일 크기: {file_size} bytes ({file_size/1024:.2f} KB)")
        print(f"[녹화 완료] 저장된 프레임 수: {frame_count}, 실제 영상 길이: {actual_duration:.1f}초")
        print(f"[녹화 완료] 형식: {used_combination[2]} (웹 브라우저 호환)")
        
        return os.path.basename(final_file_path)
    else:
        print(f"[녹화 실패] 파일이 생성되지 않았습니다: {final_file_path}")
        return None

def update_event_file_path(event_file_id, new_filename):
    """메인 스레드에서 DB 파일 경로를 업데이트"""
    try:
        event_file = EventFile.query.get(event_file_id)
        if event_file:
            old_filename = event_file.file_path
            event_file.file_path = new_filename
            db.session.commit()
            print(f"[DB 업데이트] 파일명 변경: {old_filename} -> {new_filename}")
            return True
        else:
            print(f"[DB 업데이트] EventFile ID {event_file_id}를 찾을 수 없음")
            return False
    except Exception as e:
        print(f"[DB 업데이트] 실패: {e}")
        return False

def draw_detections_on_frame(frame, results, confidence_threshold=BBOX_DISPLAY_THRESHOLD):
    """confidence 임계값 이상인 탐지 결과만 프레임에 그리기"""
    if not results or len(results) == 0: return frame
    
    annotated_frame = frame.copy()
    names = results[0].names
    
    for box in results[0].boxes:
        confidence = float(box.conf[0])
        
        # confidence 임계값 체크
        if confidence < confidence_threshold:
            continue
            
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cls = int(box.cls[0])
        class_name = names[cls]
        
        # 객체 타입에 따른 색상 설정
        if class_name == 'person':
            color = (0, 0, 255)  # 빨강
        elif class_name == 'scrofa':
            color = (255, 0, 0)  # 파랑
        elif class_name == 'inermis':
            color = (0, 255, 0)  # 초록
        else:
            color = (255, 255, 0)  # 청록
        
        # BBox 그리기
        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
        
        # 라벨 그리기 (객체 타입 + confidence)
        label = f'{class_name} {confidence:.2f}'
        label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)[0]
        
        # 라벨 배경 그리기
        cv2.rectangle(annotated_frame, (x1, y1 - label_size[1] - 10), 
                     (x1 + label_size[0], y1), color, -1)
        
        # 라벨 텍스트 그리기
        cv2.putText(annotated_frame, label, (x1, y1 - 5), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
    
    return annotated_frame


def start_video_processing(app, sid, stream_config):
    # 1. stream_config에서 파라미터 추출 ---
    is_live = stream_config.get('is_live_stream', False)
    is_test_video = not is_live
    model_name = stream_config.get('model')
    user_id = stream_config.get('user_id')
    
    # 소스 결정
    if is_live:
        # camera_id를 직접 사용 (1이면 1, 0이면 0)
        camera_id_raw = stream_config.get('camera_id', 0)
        # camera_id가 1이면 실제로는 0번 카메라 사용 (Windows 기본 웹캠)
        video_source = 0 if camera_id_raw == 1 else int(camera_id_raw) - 1
        print(f"카메라 ID {camera_id_raw} → 비디오 소스 {video_source}")
        rgb_path = None
        tir_path = None
    else: # 시험 영상
        rgb_path = stream_config.get('rgb_path')
        tir_path = stream_config.get('tir_path')
        video_source = rgb_path

    is_multi_spectral = stream_config.get('is_multi_spectral', False)
    camera_id_for_db = stream_config.get('camera_id') # DB 저장용 ID

    # 2. 모델 로드 ---
    current_model = load_model(model_name)
    if not current_model:
        socketio.emit('error', {'message': f"AI 모델 '{model_name}'을 로드할 수 없습니다. 기본 모델을 사용합니다."}, room=sid)
        current_model = model # 기본 모델로 대체
    
    # 3. 비디오 캡처 초기화 ---
    if is_live:
        # Windows에서 웹캠 접근을 위한 다양한 백엔드 시도
        cap = None
        backends_to_try = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
        
        for backend in backends_to_try:
            print(f"백엔드 {backend}로 카메라 {video_source} 열기 시도...")
            cap = cv2.VideoCapture(video_source, backend)
            if cap.isOpened():
                print(f"백엔드 {backend}로 카메라 {video_source} 열기 성공!")
                break
            cap.release()
            cap = None
        
        # 모든 백엔드 실패시 기본 방식으로 시도
        if cap is None:
            print("모든 백엔드 실패, 기본 방식으로 시도...")
            cap = cv2.VideoCapture(video_source)
    else:
        cap = cv2.VideoCapture(video_source)

    if not cap or not cap.isOpened():
        error_msg = f"비디오 소스({video_source})를 열 수 없습니다."
        if is_live:
            error_msg += f" 카메라 ID: {camera_id_for_db}, 실제 소스: {video_source}"
            print(f"[ERROR] {error_msg}")
            # 카메라 정보 확인
            print(f"[DEBUG] OpenCV 버전: {cv2.__version__}")
            print(f"[DEBUG] 사용 가능한 백엔드들: {[cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]}")
        socketio.emit('error', {'message': error_msg}, room=sid)
        return

    tir_cap = None
    if is_multi_spectral and tir_path and tir_path != rgb_path:
        tir_cap = cv2.VideoCapture(tir_path)
        if not tir_cap.isOpened():
            socketio.emit('error', {'message': f"TIR 영상({tir_path})을 열 수 없습니다."}, room=sid)
            cap.release()
            return

    # 4. 처리 루프 설정 ---
    # 시간 기반 버퍼: (timestamp, frame) 튜플로 저장
    frame_buffer = deque()  # maxlen 제거하여 시간 기준으로 직접 관리
    last_event_time = 0
    event_cooldown = 30
    current_recording = None  # 현재 진행 중인 녹화 정보
    
    # 시험 영상인 경우 제어 상태 초기화
    if is_test_video:
        test_video_controls[sid] = {
            'is_paused': False,
            'current_time': 0.0,
            'playback_rate': 1.0,
            'seek_time': None,
            '_last_logged_rate': None  # 로깅 추적용
        }

    if is_live:
        print(f"[실시간] 카메라 {video_source} 스트리밍 시작 (모델: {model_name}, 클라이언트: {sid})")
        if cap:
            print(f"[실시간] 카메라 설정 - 해상도: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}, FPS: {cap.get(cv2.CAP_PROP_FPS)}")
    else:
        print(f"[시험 영상] 분석 시작: RGB={os.path.basename(rgb_path)}, TIR={os.path.basename(tir_path)}, 모델={model_name}, 클라이언트: {sid}")

    with app.app_context():
        while True:
            # 시험 영상인 경우 제어 상태 확인
            if is_test_video:
                control_state = get_test_video_control(sid)
                
                # 시간 이동 요청 처리
                if control_state.get('seek_time') is not None:
                    seek_time = control_state['seek_time']
                    video_fps = cap.get(cv2.CAP_PROP_FPS)
                    if video_fps <= 0:
                        video_fps = 30  # 기본값 설정
                    
                    seek_frame = int(seek_time * video_fps)
                    print(f"[비디오 제어] 시간 이동 요청: {seek_time}초 -> {seek_frame}프레임 (FPS: {video_fps})")
                    
                    cap.set(cv2.CAP_PROP_POS_FRAMES, seek_frame)
                    if tir_cap:
                        tir_cap.set(cv2.CAP_PROP_POS_FRAMES, seek_frame)
                    
                    # 시간 이동 완료 후 seek_time 초기화
                    test_video_controls[sid]['seek_time'] = None
                    print(f"[비디오 제어] 시간 이동 실행 완료: {seek_time}초")
                
                # 일시정지 상태 확인
                if control_state.get('is_paused', False):
                    socketio.sleep(0.1)  # 일시정지 중에는 대기
                    continue
                
                # 재생 속도 적용 (FPS 조정)
                playback_rate = control_state.get('playback_rate', 1.0)
                base_fps = max(FPS, 60)  # 기본 FPS
                adjusted_fps = base_fps * playback_rate
                
                # 배속 변경 시 로깅 (1회만)
                last_logged_rate = control_state.get('_last_logged_rate')
                if last_logged_rate != playback_rate:
                    print(f"[비디오 제어] 재생 속도 적용: {playback_rate}x, 기본 FPS: {base_fps}, 조정된 FPS: {adjusted_fps}")
                    test_video_controls[sid]['_last_logged_rate'] = playback_rate
            else:
                adjusted_fps = FPS
            
            ret, frame_rgb = cap.read()
            if not ret:
                if is_test_video: # 시험 영상이면 반복 재생
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    if tir_cap:
                        tir_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                break # 라이브 스트림이면 종료

            # 현재 시간과 함께 프레임 저장
            current_time = time.time()
            frame_buffer.append((current_time, frame_rgb.copy()))
            
            # 10초보다 오래된 프레임들을 버퍼에서 제거 (시간 기준)
            buffer_time_limit = current_time - RECORD_SECONDS_BEFORE
            while frame_buffer and frame_buffer[0][0] < buffer_time_limit:
                frame_buffer.popleft()
            
            # 현재 진행 중인 녹화가 있으면 이후 프레임 수집
            if current_recording is not None:
                current_recording['post_event_frames'].append((current_time, frame_rgb.copy()))
                
                # 시간 기준으로 이후 10초 수집 완료 확인
                time_elapsed = current_time - current_recording['event_timestamp']
                if time_elapsed >= RECORD_SECONDS_AFTER:
                    # 이후 프레임 수집 완료, 녹화 시작
                    print(f"[녹화] 이후 {time_elapsed:.1f}초 프레임 수집 완료, 영상 생성 시작")
                    
                    # 시간 기준으로 정확한 20초 분량 추출
                    start_time = current_recording['event_timestamp'] - RECORD_SECONDS_BEFORE
                    end_time = current_recording['event_timestamp'] + RECORD_SECONDS_AFTER
                    
                    # 이전 프레임에서 시간 범위에 맞는 것들만 추출
                    pre_frames = []
                    for timestamp, frame in current_recording['pre_event_frames']:
                        if start_time <= timestamp <= current_recording['event_timestamp']:
                            pre_frames.append(frame)
                    
                    # 이후 프레임에서 시간 범위에 맞는 것들만 추출
                    post_frames = []
                    for timestamp, frame in current_recording['post_event_frames']:
                        if current_recording['event_timestamp'] < timestamp <= end_time:
                            post_frames.append(frame)
                    
                    # 최종 버퍼 생성
                    final_buffer = pre_frames + post_frames
                    
                    # 실제 20초 분량이 되도록 정확한 FPS 계산
                    if len(final_buffer) > 0:
                        calculated_fps = len(final_buffer) / TOTAL_RECORD_SECONDS
                        print(f"[녹화] 시간 기준 정확한 20초 분량 - 이전: {len(pre_frames)}프레임, 이후: {len(post_frames)}프레임, 총: {len(final_buffer)}프레임")
                        print(f"[녹화] 계산된 FPS: {calculated_fps:.2f} (총 {len(final_buffer)}프레임 ÷ {TOTAL_RECORD_SECONDS}초)")
                        
                        # 별도 스레드에서 영상 저장하고 완료 시 DB 업데이트
                        # 클로저로 현재 값들을 캡처
                        original_filename = os.path.basename(current_recording['file_path'])
                        event_file_id = current_recording['event_file_id']
                        
                        def video_save_callback(future):
                            """영상 저장 완료 시 호출되는 콜백"""
                            try:
                                result_filename = future.result()
                                if result_filename and result_filename != original_filename:
                                    # 확장자가 변경된 경우에만 DB 업데이트
                                    print(f"[영상 저장 완료] 파일명 변경 감지: {original_filename} -> {result_filename}")
                                    socketio.start_background_task(
                                        update_event_file_path, 
                                        event_file_id, 
                                        result_filename
                                    )
                                else:
                                    print(f"[영상 저장 완료] 파일명 변경 없음: {result_filename}")
                            except Exception as e:
                                print(f"[영상 저장 콜백] 오류: {e}")
                        
                        # ThreadPoolExecutor를 사용해서 결과를 받을 수 있도록 함
                        executor = ThreadPoolExecutor(max_workers=1)
                        future = executor.submit(save_video_clip, final_buffer, current_recording['file_path'], calculated_fps)
                        future.add_done_callback(video_save_callback)
                    else:
                        print(f"[녹화 실패] 수집된 프레임이 없습니다.")
                    
                    # 녹화 완료 처리
                    current_recording = None
                    print(f"[녹화] 20초 분량 영상 저장 스레드 시작됨")
                else:
                    # 진행률 출력 (2초마다)
                    if int(time_elapsed) % 2 == 0 and time_elapsed != current_recording.get('last_progress_time', -1):
                        current_recording['last_progress_time'] = time_elapsed
                        progress = min(time_elapsed / RECORD_SECONDS_AFTER * 100, 100)
                        print(f"[녹화 진행] 이후 프레임 수집 중: {time_elapsed:.1f}/{RECORD_SECONDS_AFTER}초 ({progress:.1f}%)")
            
            # TIR 프레임 처리
            if tir_cap:
                ret_tir, frame_tir = tir_cap.read()
                if ret_tir:
                    frame_tir_gray = cv2.cvtColor(frame_tir, cv2.COLOR_BGR2GRAY)
                else: # TIR 영상 프레임이 없으면 RGB로 변환
                    frame_tir_gray = transform_rgb_to_tir(frame_rgb)
            else: # TIR 영상이 없으면 RGB로 변환
                frame_tir_gray = transform_rgb_to_tir(frame_rgb)
            
            # AI 모델 입력 데이터 준비
            annotated_frame_rgb = frame_rgb.copy()
            annotated_frame_tir = cv2.cvtColor(frame_tir_gray, cv2.COLOR_GRAY2BGR)
            
            is_person_detected = False
            
            if current_model:
                frame_tir_gray_reshaped = np.expand_dims(frame_tir_gray, axis=-1)
                input_data = np.concatenate((frame_rgb, frame_tir_gray_reshaped), axis=-1)
                results = current_model.track(input_data, verbose=False, persist=True)
                
                annotated_frame_rgb = draw_detections_on_frame(frame_rgb, results, BBOX_DISPLAY_THRESHOLD)
                annotated_frame_tir = draw_detections_on_frame(annotated_frame_tir, results, BBOX_DISPLAY_THRESHOLD)
                
                # 이벤트 발생 조건 확인
                names = results[0].names
                for r in results:
                    for box in r.boxes:
                        confidence = float(box.conf[0])
                        detected_class_name = names[int(box.cls[0])]

                        is_person = detected_class_name == 'person' and confidence >= PERSON_CONFIDENCE_THRESHOLD
                        is_animal = detected_class_name in ['scrofa', 'inermis'] and confidence >= ANIMAL_CONFIDENCE_THRESHOLD

                        if is_person or is_animal:
                            is_person_detected = is_person # UI 경고용 플래그

                            # DB 이벤트 생성 (라이브 모드 & 쿨다운 통과 시)
                            if is_live and (time.time() - last_event_time > event_cooldown):
                                last_event_time = time.time()
                                detected_object_type = 'person' if is_person else detected_class_name
                                
                                event_timestamp = time.time()  # 이벤트 발생 정확한 시간
                                print(f"[{detected_object_type} 탐지] 카메라 {camera_id_for_db}에서 이벤트 발생. confidence: {confidence:.2f}")
                                
                                # 시간 기반 버퍼 검증: 10초 미만의 데이터가 있으면 녹화를 무시
                                if not frame_buffer:
                                    print(f"[녹화 무시] 버퍼가 비어있습니다.")
                                    continue
                                
                                # 가장 오래된 프레임과 이벤트 시간의 차이 확인
                                oldest_frame_time = frame_buffer[0][0]
                                buffer_duration = event_timestamp - oldest_frame_time
                                
                                if buffer_duration < RECORD_SECONDS_BEFORE:
                                    print(f"[녹화 무시] 버퍼에 충분한 시간 데이터가 없습니다. 현재: {buffer_duration:.1f}초, 필요: {RECORD_SECONDS_BEFORE}초")
                                    continue
                                
                                print(f"[녹화 시작] 이벤트 발생 시점(timestamp: {event_timestamp:.3f}) 기준 이전 {RECORD_SECONDS_BEFORE}초 + 이후 {RECORD_SECONDS_AFTER}초 녹화를 시작합니다.")
                                print(f"[녹화] 버퍼 시간 범위: {buffer_duration:.1f}초, 프레임 수: {len(frame_buffer)}개")
                                
                                camera = Camera.query.get(int(camera_id_for_db))
                                if not camera: # 예외 처리: 카메라가 DB에 없는 경우
                                    print(f"경고: DB에서 카메라 ID {int(camera_id_for_db)}을 찾을 수 없습니다.")
                                    continue

                                new_event = DetectionEvent(camera_id=camera.id, detected_object=detected_object_type, confidence=confidence, user_id_on_duty=user_id)
                                db.session.add(new_event)
                                db.session.commit()
                                
                                timestamp_str = datetime.fromtimestamp(event_timestamp).strftime("%Y%m%d_%H%M%S")
                                filename = f"event_{timestamp_str}_cam{camera_id_for_db}.mp4"
                                recordings_base_path = os.path.join(app.root_path, '..', RECORDINGS_FOLDER)
                                file_path = os.path.join(recordings_base_path, filename)

                                new_event_file = EventFile(event_id=new_event.id, file_type='video_rgb', file_path=filename)
                                db.session.add(new_event_file)
                                db.session.commit()
                                
                                socketio.emit('new_event', new_event.to_dict())
                                
                                # 시간 기반 녹화 로직: 이전 10초 + 이후 10초
                                current_recording = {
                                    'file_path': file_path,
                                    'event_timestamp': event_timestamp,  # 이벤트 발생 정확한 시간
                                    'pre_event_frames': list(frame_buffer),  # 이벤트 이전 프레임들 (timestamp, frame) 튜플들
                                    'post_event_frames': [],  # 이벤트 이후 프레임들
                                    'start_time': event_timestamp,
                                    'last_progress_time': -1,  # 진행률 출력 중복 방지용
                                    'event_file_id': new_event_file.id  # DB 업데이트용 ID
                                }
                                
                                # 이전 프레임 통계
                                pre_frame_count = len(current_recording['pre_event_frames'])
                                if pre_frame_count > 0:
                                    pre_duration = event_timestamp - current_recording['pre_event_frames'][0][0]
                                    print(f"[녹화] 이전 프레임 {pre_frame_count}개 수집 완료 (시간 범위: {pre_duration:.1f}초), 이후 {RECORD_SECONDS_AFTER}초 프레임 수집 시작")
                                else:
                                    print(f"[녹화] 이전 프레임 없음, 이후 {RECORD_SECONDS_AFTER}초 프레임 수집 시작")
                                break # 한 이벤트에 대해 한 번만 처리
                    if is_person_detected:
                        break

            # 프레임 인코딩 및 전송
            _, buffer_rgb = cv2.imencode('.jpg', annotated_frame_rgb)
            _, buffer_tir = cv2.imencode('.jpg', annotated_frame_tir)
            rgb_b64 = base64.b64encode(buffer_rgb).decode('utf-8')
            tir_b64 = base64.b64encode(buffer_tir).decode('utf-8')
            
            # 시험 영상인 경우 현재 시간과 길이 정보 추가
            frame_data = {
                'rgb': rgb_b64,
                'tir': tir_b64,
                'camera_id': 'test_video' if is_test_video else camera_id_for_db,
                'person_detected': is_person_detected
            }
            
            if is_test_video:
                current_frame = cap.get(cv2.CAP_PROP_POS_FRAMES)
                total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                video_fps = cap.get(cv2.CAP_PROP_FPS)
                
                if video_fps > 0:
                    current_time = current_frame / video_fps
                    total_duration = total_frames / video_fps
                else:
                    current_time = 0
                    total_duration = 0
                
                frame_data.update({
                    'current_time': current_time,
                    'duration': total_duration,
                    'current_frame': current_frame,
                    'total_frames': total_frames
                })
            
            socketio.emit('video_frame', frame_data, room=sid)
            socketio.sleep(1 / adjusted_fps)

    # 5. 종료 처리 ---
    try:
        if cap:
            cap.release()
            print(f"[정리] 카메라/비디오 캡처 해제 완료")
        if tir_cap:
            tir_cap.release()
            print(f"[정리] TIR 비디오 캡처 해제 완료")
        
        # 시험 영상 제어 상태 정리
        if is_test_video:
            clear_test_video_control(sid)
        
        if is_live:
            print(f"[실시간] 카메라 {video_source} 스트리밍 스레드 종료 (클라이언트: {sid})")
        else:
            print(f"[시험 영상] 분석 스레드 종료 (RGB: {os.path.basename(rgb_path)}, 클라이언트: {sid})")
    except Exception as e:
        print(f"[정리] 스레드 종료 중 오류 발생: {e}")
    finally:
        # 강제로 모든 OpenCV 창 닫기 (Windows에서 필요할 수 있음)
        try:
            cv2.destroyAllWindows()
        except:
            pass