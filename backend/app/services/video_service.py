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
RECORD_SECONDS = 10  # 이벤트 전 버퍼 시간
RECORD_SECONDS_AFTER = 10  # 이벤트 후 녹화 시간
FPS = 40
RECORDINGS_FOLDER = "event_recordings"

# --- 시험 영상 제어용 전역 변수 ---
test_video_controls = {}  # 클라이언트별 비디오 제어 상태 저장

# --- 서버 종료 제어용 전역 변수 ---
shutdown_flag = False  # 서버 종료 시그널 플래그
active_video_sessions = {}  # 활성 비디오 세션 추적 {sid: True}

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

def set_shutdown_flag():
    """서버 종료 플래그 설정"""
    global shutdown_flag
    shutdown_flag = True
    print("[종료] 모든 비디오 처리 루프에 종료 시그널 전송")

def is_shutdown_requested():
    """서버 종료 요청 확인"""
    return shutdown_flag

def register_video_session(sid):
    """비디오 세션 등록"""
    active_video_sessions[sid] = True
    print(f"[세션] 비디오 세션 등록: {sid}")

def unregister_video_session(sid):
    """비디오 세션 해제"""
    if sid in active_video_sessions:
        del active_video_sessions[sid]
        print(f"[세션] 비디오 세션 해제: {sid}")

# --- Confidence 임계값 설정 ---
PERSON_CONFIDENCE_THRESHOLD = 0.5  # 사람 탐지 임계값 (BBox 표시 기준과 동일)
ANIMAL_CONFIDENCE_THRESHOLD = 0.7  # 동물 탐지 임계값
BBOX_DISPLAY_THRESHOLD = 0.5       # BBox 표시 임계값

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

def update_event_file_path(event_id, actual_file_path):
    """실제 저장된 파일 경로로 데이터베이스 업데이트"""
    try:
        from flask import current_app
        with current_app.app_context():
            event_file = EventFile.query.filter_by(event_id=event_id, file_type='video_rgb').first()
            if event_file and actual_file_path:
                # 파일명만 추출 (디렉토리 경로 제외)
                actual_filename = os.path.basename(actual_file_path)
                event_file.file_path = actual_filename
                db.session.commit()
                print(f"[DB 업데이트] 이벤트 {event_id} 파일 경로 업데이트: {actual_filename}")
            else:
                print(f"[DB 업데이트 실패] 이벤트 {event_id} 파일 정보를 찾을 수 없거나 파일 경로가 None입니다.")
    except Exception as e:
        print(f"[DB 업데이트 오류] 이벤트 {event_id} 파일 경로 업데이트 실패: {e}")

def record_event_with_delay(initial_buffer, file_path, fps, cap, tir_cap, additional_seconds, event_id=None):
    """이벤트 발생 후 추가 프레임을 수집하여 녹화하는 함수"""
    print(f"[녹화] 이벤트 후 {additional_seconds}초 동안 추가 프레임 수집 시작")
    
    additional_frames = []
    frames_to_collect = int(fps * additional_seconds)
    frame_interval = 1.0 / fps  # 프레임 간격 계산
    
    try:
        start_time = time.time()
        for i in range(frames_to_collect):
            # 비디오 캡처가 여전히 유효한지 확인
            if not cap or not cap.isOpened():
                print(f"[녹화] 비디오 캡처가 닫혔습니다. 수집된 프레임: {i}/{frames_to_collect}")
                break
                
            ret, frame = cap.read()
            if not ret:
                print(f"[녹화] 추가 프레임 수집 중 실패: {i}/{frames_to_collect}")
                break
            
            additional_frames.append(frame.copy())
            
            # 프레임 수집 속도 조절 (실제 비디오 재생 속도와 맞춤)
            elapsed = time.time() - start_time
            expected_time = (i + 1) * frame_interval
            if elapsed < expected_time:
                time.sleep(expected_time - elapsed)
        
        collected_seconds = len(additional_frames) / fps
        print(f"[녹화] 추가 프레임 수집 완료: {len(additional_frames)}/{frames_to_collect} ({collected_seconds:.1f}초)")
        actual_file_path = save_video_clip(initial_buffer, file_path, fps, additional_frames)
        
        # 데이터베이스 파일 경로 업데이트
        if event_id and actual_file_path:
            update_event_file_path(event_id, actual_file_path)
        
        return actual_file_path
        
    except Exception as e:
        print(f"[녹화 오류] 추가 프레임 수집 중 오류 발생: {e}")
        # 오류 발생 시 기본 버퍼만으로 녹화
        actual_file_path = save_video_clip(initial_buffer, file_path, fps)
        
        # 데이터베이스 파일 경로 업데이트
        if event_id and actual_file_path:
            update_event_file_path(event_id, actual_file_path)
        
        return actual_file_path

def save_video_clip(buffer, file_path, fps, additional_frames=None):
    print(f"[녹화 시작] 버퍼 크기: {len(buffer)} 프레임, 추가 프레임: {len(additional_frames) if additional_frames else 0} 프레임")
    if not buffer: 
        print("[녹화 실패] 버퍼가 비어있습니다.")
        return None
    
    recordings_dir = os.path.dirname(file_path)
    if not os.path.exists(recordings_dir): 
        os.makedirs(recordings_dir)
        print(f"[녹화] 디렉토리 생성: {recordings_dir}")
    
    height, width, _ = buffer[0].shape
    print(f"[녹화] 프레임 크기: {width}x{height}, FPS: {fps}")
    
    # Windows 환경 및 브라우저 호환성을 위한 코덱 선택 (우선순위 순)
    codecs_to_try = [
        ('XVID', 'XVID'),             # Windows에서 가장 안정적
        ('MJPG', 'Motion JPEG'),      # 범용적으로 지원되는 코덱
        ('mp4v', 'MPEG-4'),           # 기존 사용 코덱
        ('avc1', 'H.264 (AVC1)'),     # H.264 (라이브러리 있을 때만)
        ('H264', 'H.264')             # 대체 H.264 표기법
    ]
    
    writer = None
    used_codec = None
    
    for codec_code, codec_name in codecs_to_try:
        try:
            fourcc = cv2.VideoWriter_fourcc(*codec_code)
            writer = cv2.VideoWriter(file_path, fourcc, fps, (width, height))
            
            if writer.isOpened():
                used_codec = codec_name
                print(f"[녹화] 사용 코덱: {codec_name} ({codec_code})")
                break
            else:
                print(f"[녹화] {codec_name} ({codec_code}) 코덱 실패 - VideoWriter 열기 실패")
                writer.release()
        except Exception as e:
            print(f"[녹화] {codec_name} ({codec_code}) 코덱 실패 - 예외 발생: {e}")
            if writer:
                writer.release()
    
    if writer is None or not writer.isOpened():
        print(f"[녹화 실패] 모든 코덱으로 VideoWriter를 열 수 없습니다: {file_path}")
        
        # 최후 대안: AVI 파일로 XVID 코덱 재시도
        if file_path.endswith('.mp4'):
            avi_path = file_path.replace('.mp4', '.avi')
            print(f"[녹화] 최후 대안: AVI 형식으로 재시도 - {avi_path}")
            try:
                fourcc = cv2.VideoWriter_fourcc(*'XVID')
                writer = cv2.VideoWriter(avi_path, fourcc, fps, (width, height))
                if writer.isOpened():
                    used_codec = 'XVID (AVI)'
                    file_path = avi_path  # 파일 경로 업데이트
                    print(f"[녹화] AVI 형식으로 성공: {used_codec}")
                else:
                    print(f"[녹화 실패] AVI 형식도 실패")
                    return None
            except Exception as e:
                print(f"[녹화 실패] AVI 형식 재시도 중 예외: {e}")
                return None
        else:
            return None
    
    frame_count = 0
    # 버퍼의 프레임들을 먼저 기록 (이벤트 이전)
    for frame in list(buffer): 
        writer.write(frame)
        frame_count += 1
    
    # 추가 프레임들을 기록 (이벤트 이후)
    if additional_frames:
        for frame in additional_frames:
            writer.write(frame)
            frame_count += 1
    
    writer.release()
    
    # 파일 크기 확인 및 실제 저장된 파일 경로 반환
    if os.path.exists(file_path):
        file_size = os.path.getsize(file_path)
        print(f"[녹화 완료] 영상이 다음 경로에 저장되었습니다: {file_path}")
        print(f"[녹화 완료] 사용된 코덱: {used_codec}")
        print(f"[녹화 완료] 파일 크기: {file_size} bytes ({file_size/1024:.2f} KB)")
        total_seconds = frame_count / fps
        print(f"[녹화 완료] 저장된 프레임 수: {frame_count}, 전체 시간: {total_seconds:.1f}초")
        return file_path  # 실제 저장된 파일 경로 반환
    else:
        print(f"[녹화 실패] 파일이 생성되지 않았습니다: {file_path}")
        return None

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
    frame_buffer = deque(maxlen=FPS * RECORD_SECONDS)
    last_event_time = 0
    event_cooldown = 30
    
    # 버퍼 모니터링을 위한 변수들
    buffer_start_time = time.time()
    last_buffer_log_time = 0
    buffer_log_interval = 1.0  # 1초 간격으로 로깅
    
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

    # 비디오 세션 등록
    register_video_session(sid)
    
    try:
        with app.app_context():
            while True:
                # 서버 종료 요청 확인
                if is_shutdown_requested():
                    print(f"[종료] 서버 종료 요청으로 비디오 처리 루프 종료 (클라이언트: {sid})")
                    break
                    
                current_time = time.time()
                
                # 1초마다 버퍼 상태 로깅
                if current_time - last_buffer_log_time >= buffer_log_interval:
                    buffer_count = len(frame_buffer)
                    buffer_max = frame_buffer.maxlen
                    # 실제 경과 시간 기반으로 버퍼 시간 계산
                    actual_buffer_time = min((current_time - buffer_start_time), RECORD_SECONDS)
                    buffer_fill_ratio = (buffer_count / buffer_max) * 100 if buffer_max > 0 else 0
                    
                    print(f"[버퍼 상태] 프레임: {buffer_count}/{buffer_max}, 시간: {actual_buffer_time:.1f}초/{RECORD_SECONDS}초, 충전율: {buffer_fill_ratio:.1f}%")
                    last_buffer_log_time = current_time
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
            
            # frame_rgb = cv2.cvtColor(frame_rgb, cv2.COLOR_BGR2RGB)
            # 밑 블럭은 혹시몰라 넣은것것
            # current_frame = cap.get(cv2.CAP_PROP_POS_FRAMES)
            # total_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            # video_fps = cap.get(cv2.CAP_PROP_FPS)
            # if video_fps > 0:
            #     current_time = current_frame / video_fps
            #     total_duration = total_frames / video_fps
            # else:
            #     current_time = 0
            #     total_duration = 0

            frame_buffer.append(frame_rgb.copy())
            
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
                                # 버퍼 검증: 10초 미만일 경우 녹화 건너뛰기
                                current_time_check = time.time()
                                actual_buffer_time = min((current_time_check - buffer_start_time), RECORD_SECONDS)
                                buffer_count = len(frame_buffer)
                                
                                if actual_buffer_time < RECORD_SECONDS:
                                    print(f"[녹화 건너뛰기] 버퍼 시간이 부족합니다: {actual_buffer_time:.1f}초 < {RECORD_SECONDS}초 (프레임: {buffer_count}/{frame_buffer.maxlen})")
                                    continue
                                
                                last_event_time = time.time()
                                detected_object_type = 'person' if is_person else detected_class_name
                                
                                print(f"[{detected_object_type} 탐지] 카메라 {camera_id_for_db}에서 이벤트 발생. confidence: {confidence:.2f}, 녹화를 시작합니다.")
                                
                                camera = Camera.query.get(int(camera_id_for_db))
                                if not camera: # 예외 처리: 카메라가 DB에 없는 경우
                                    print(f"경고: DB에서 카메라 ID {int(camera_id_for_db)}을 찾을 수 없습니다.")
                                    continue

                                new_event = DetectionEvent(camera_id=camera.id, detected_object=detected_object_type, confidence=confidence, user_id_on_duty=user_id)
                                db.session.add(new_event)
                                db.session.commit()
                                
                                timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
                                filename = f"event_{timestamp_str}_cam{camera_id_for_db}.mp4"
                                recordings_base_path = os.path.join(app.root_path, '..', RECORDINGS_FOLDER)
                                file_path = os.path.join(recordings_base_path, filename)

                                new_event_file = EventFile(event_id=new_event.id, file_type='video_rgb', file_path=filename)
                                db.session.add(new_event_file)
                                db.session.commit()
                                
                                socketio.emit('new_event', new_event.to_dict())
                                
                                # 이벤트 후 추가 프레임 수집을 위한 데몬 스레드 시작
                                recording_thread = threading.Thread(target=record_event_with_delay, args=(frame_buffer.copy(), file_path, FPS, cap, tir_cap, RECORD_SECONDS_AFTER, new_event.id))
                                recording_thread.daemon = True  # 데몬 스레드로 설정하여 메인 프로세스 종료 시 함께 종료
                                recording_thread.start()
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

    except Exception as e:
        print(f"[오류] 비디오 처리 중 예외 발생: {e}")
    finally:
        # 비디오 세션 해제
        unregister_video_session(sid)

    # 5. 종료 처리 ---
    try:
        # OpenCV 리소스 해제를 별도 스레드에서 실행하여 시간 제한
        def release_opencv_resources():
            try:
                if cap:
                    cap.release()
                    print(f"[정리] 카메라/비디오 캡처 해제 완료")
                if tir_cap:
                    tir_cap.release()
                    print(f"[정리] TIR 비디오 캡처 해제 완료")
            except Exception as e:
                print(f"[정리] OpenCV 리소스 해제 중 오류: {e}")
        
        # 리소스 해제를 별도 스레드에서 실행 (최대 2초 대기)
        release_thread = threading.Thread(target=release_opencv_resources)
        release_thread.daemon = True
        release_thread.start()
        release_thread.join(timeout=2.0)  # 최대 2초 대기
        
        if release_thread.is_alive():
            print(f"[정리] OpenCV 리소스 해제가 시간 초과되어 강제 종료합니다")
        
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