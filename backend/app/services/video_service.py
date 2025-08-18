# /backend/app/services/video_service.py (사용자님 코드 기반 최종 수정본)

import cv2
import numpy as np
import base64
from flask import current_app
from ..extensions import socketio, db
from ..models.db_models import DetectionEvent, EventFile, Camera
import time
from datetime import datetime
import json
from collections import deque
import os
import threading
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
RECORD_SECONDS = 10
FPS = 20
RECORDINGS_FOLDER = "event_recordings"

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
    if not buffer: return
    recordings_dir = os.path.dirname(file_path)
    if not os.path.exists(recordings_dir): os.makedirs(recordings_dir)
    height, width, _ = buffer[0].shape
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(file_path, fourcc, fps, (width, height))
    for frame in list(buffer): writer.write(frame)
    writer.release()
    print(f"[녹화 완료] 영상이 다음 경로에 저장되었습니다: {file_path}")

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
    
    # 소스 결정
    if is_live:
        video_source = int(stream_config.get('camera_id', 1)) - 1 # camera_id는 1부터 시작, VideoCapture는 0부터 시작
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
        cap = cv2.VideoCapture(video_source, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(video_source)

    if not cap.isOpened():
        socketio.emit('error', {'message': f"비디오 소스({video_source})를 열 수 없습니다."}, room=sid)
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

    if is_live:
        print(f"카메라 {video_source} 스트리밍 시작 (모델: {model_name})")
    else:
        print(f"시험 영상 분석 시작: RGB={os.path.basename(rgb_path)}, TIR={os.path.basename(tir_path)}, 모델={model_name}")

    with app.app_context():
        while True:
            ret, frame_rgb = cap.read()
            if not ret:
                if is_test_video: # 시험 영상이면 반복 재생
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    if tir_cap:
                        tir_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                break # 라이브 스트림이면 종료

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
                results = current_model(input_data, verbose=False)
                
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
                                
                                print(f"[{detected_object_type} 탐지] 카메라 {camera_id_for_db}에서 이벤트 발생. confidence: {confidence:.2f}, 녹화를 시작합니다.")
                                
                                camera = Camera.query.get(int(camera_id_for_db))
                                if not camera: # 예외 처리: 카메라가 DB에 없는 경우
                                    print(f"경고: DB에서 카메라 ID {int(camera_id_for_db)}을 찾을 수 없습니다.")
                                    continue

                                new_event = DetectionEvent(camera_id=camera.id, detected_object=detected_object_type, confidence=confidence)
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
                                threading.Thread(target=save_video_clip, args=(frame_buffer.copy(), file_path, FPS)).start()
                                break # 한 이벤트에 대해 한 번만 처리
                    if is_person_detected:
                        break

            # 프레임 인코딩 및 전송
            _, buffer_rgb = cv2.imencode('.jpg', annotated_frame_rgb)
            _, buffer_tir = cv2.imencode('.jpg', annotated_frame_tir)
            rgb_b64 = base64.b64encode(buffer_rgb).decode('utf-8')
            tir_b64 = base64.b64encode(buffer_tir).decode('utf-8')
            
            socketio.emit('video_frame', {
                'rgb': rgb_b64,
                'tir': tir_b64,
                'camera_id': 'test_video' if is_test_video else video_source,
                'person_detected': is_person_detected
            }, room=sid)
            socketio.sleep(1 / FPS)

    # 5. 종료 처리 ---
    cap.release()
    if tir_cap:
        tir_cap.release()
    
    if is_live:
        print(f"카메라 {video_source} 스트리밍 스레드 종료.")
    else:
        print(f"시험 영상 분석 스레드 종료. (RGB: {os.path.basename(rgb_path)})")