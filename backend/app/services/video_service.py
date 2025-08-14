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

# --- 전역 설정 ---
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'models_ai', 'yolo11n_early_fusion.pt')
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


def start_video_processing(app, camera_id, sid):
    # 다중 스펙트럼 분석 파라미터 확인
    is_multi_spectral = isinstance(camera_id, dict) and camera_id.get('is_multi_spectral', False)
    is_test_video = isinstance(camera_id, str) or is_multi_spectral
    
    if is_multi_spectral:
        # 다중 스펙트럼 분석 모드
        rgb_path = camera_id['rgb_path']
        tir_path = camera_id['tir_path']
        model_name = camera_id['model']
        video_source = rgb_path  # 주 영상 소스로 RGB 사용
        print(f"다중 스펙트럼 분석 시작: RGB={rgb_path}, TIR={tir_path}, Model={model_name}")
    else:
        # 기존 로직
        video_source = camera_id if is_test_video else int(camera_id)
    
    cap = cv2.VideoCapture(video_source)
    
    # TIR 영상을 위한 별도 캡처 (다중 스펙트럼인 경우)
    tir_cap = None
    if is_multi_spectral and tir_path != rgb_path:
        tir_cap = cv2.VideoCapture(tir_path)
        if not tir_cap.isOpened():
            socketio.emit('error', {'message': f"TIR 영상({tir_path})을 열 수 없습니다."}, room=sid)
            return
    
    # 선택된 모델 로드
    current_model = model  # 기본 모델
    if is_multi_spectral:
        current_model = load_model(model_name)
        if not current_model:
            current_model = model  # 실패 시 기본 모델 사용

    frame_buffer = deque(maxlen=FPS * RECORD_SECONDS)
    last_event_time = 0
    event_cooldown = 30

    if not cap.isOpened():
        socketio.emit('error', {'message': f"카메라/영상({camera_id})을 열 수 없습니다."}, room=sid)
        return

    with app.app_context():
        while True:
            ret, frame_rgb = cap.read()
            if not ret:
                if is_test_video:
                    if cap.get(cv2.CAP_PROP_POS_FRAMES) <= 1:
                        error_msg = f"시험 영상 '{os.path.basename(camera_id)}' 파일을 읽을 수 없습니다. 코덱 또는 경로 문제일 수 있습니다."
                        socketio.emit('error', {'message': error_msg}, room=sid)
                        break
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                break

            frame_buffer.append(frame_rgb.copy())
            
            # TIR 프레임 처리 (다중 스펙트럼 또는 변환)
            if is_multi_spectral and tir_cap:
                # 별도 TIR 영상에서 프레임 읽기
                ret_tir, frame_tir = tir_cap.read()
                if not ret_tir:
                    # TIR 영상이 끝나면 처음으로 돌아가거나 RGB와 동기화
                    if tir_cap.get(cv2.CAP_PROP_POS_FRAMES) <= 1:
                        break
                    tir_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret_tir, frame_tir = tir_cap.read()
                
                if ret_tir:
                    frame_tir_gray = cv2.cvtColor(frame_tir, cv2.COLOR_BGR2GRAY)
                else:
                    frame_tir_gray = transform_rgb_to_tir(frame_rgb)
            else:
                # RGB에서 TIR 변환 (기존 방식)
                frame_tir_gray = transform_rgb_to_tir(frame_rgb)
            
            # 원본 프레임 복사
            annotated_frame_rgb = frame_rgb.copy()
            annotated_frame_tir = cv2.cvtColor(frame_tir_gray, cv2.COLOR_GRAY2BGR)
            
            is_person_detected = False
            detected_object_type = None
            detected_confidence = 0.0

            if current_model:
                frame_tir_gray_reshaped = np.expand_dims(frame_tir_gray, axis=-1)
                input_data = np.concatenate((frame_rgb, frame_tir_gray_reshaped), axis=-1)

                results = current_model(input_data, verbose=False)
                
                # confidence 70% 이상인 탐지 결과만 표시
                annotated_frame_rgb = draw_detections_on_frame(frame_rgb, results, BBOX_DISPLAY_THRESHOLD)
                annotated_frame_tir = draw_detections_on_frame(annotated_frame_tir, results, BBOX_DISPLAY_THRESHOLD)
                
                # BBox가 표시되는지 확인 (경고 기준)
                has_displayed_bbox = False
                names = results[0].names
                for r in results:
                    for box in r.boxes:
                        confidence = float(box.conf[0])
                        # BBox 표시 기준과 동일한 임계값으로 경고 판단
                        if confidence >= BBOX_DISPLAY_THRESHOLD:
                            has_displayed_bbox = True
                            break
                    if has_displayed_bbox:
                        break
                
                # BBox가 표시될 때만 경고 발생
                is_person_detected = has_displayed_bbox
                
                # 이벤트 생성 로직 (기존과 동일)
                for r in results:
                    for box in r.boxes:
                        class_id = int(box.cls[0])
                        detected_class_name = names[class_id]
                        confidence = float(box.conf[0])
                        
                        # BBox 표시 기준(70% 이상)과 동일한 임계값으로 디버깅 출력
                        if confidence >= BBOX_DISPLAY_THRESHOLD:
                            print(f"[DEBUG] 탐지된 객체: {detected_class_name}, confidence: {confidence:.3f}")
                        
                        # Confidence 임계값 체크 및 이벤트 발생 조건 설정
                        should_create_event = False
                        
                        if detected_class_name == 'person' and confidence >= PERSON_CONFIDENCE_THRESHOLD:
                            should_create_event = True
                            detected_object_type = 'person'
                            detected_confidence = confidence
                            print(f"[DEBUG] 사람 탐지 - 이벤트 생성 조건 충족")
                        elif detected_class_name in ['scrofa', 'inermis'] and confidence >= ANIMAL_CONFIDENCE_THRESHOLD:
                            should_create_event = True
                            detected_object_type = detected_class_name
                            detected_confidence = confidence
                            print(f"[DEBUG] 동물 탐지 ({detected_class_name}) - 이벤트 생성 조건 충족")
                        
                        # 이벤트 생성 및 DB 저장 (테스트 모드에서는 비활성화)
                        if should_create_event and (time.time() - last_event_time > event_cooldown) and not is_test_video:
                            last_event_time = time.time()
                            
                            # 실시간 감시 모드에서만 DB에 이벤트를 기록
                            print(f"[{detected_object_type} 탐지] 카메라 {camera_id}에서 이벤트 발생. confidence: {confidence:.2f}, 녹화를 시작합니다.")
                            
                            # 카메라 정보 조회 또는 생성
                            camera = Camera.query.filter_by(id=int(camera_id) + 1).first()
                            if not camera:
                                # 카메라가 없으면 기본 정보로 생성
                                camera = Camera(
                                    id=int(camera_id) + 1,
                                    camera_name=f"카메라 {camera_id + 1}",
                                    source=f"camera_{camera_id}",
                                    location="기본 위치"
                                )
                                db.session.add(camera)
                                db.session.commit()
                            
                            new_event = DetectionEvent(
                                camera_id=camera.id,
                                detected_object=detected_object_type,
                                confidence=confidence 
                            )
                            db.session.add(new_event)
                            db.session.commit()
                            
                            now = datetime.now()
                            timestamp_str = now.strftime("%Y%m%d_%H%M%S")
                            filename = f"event_{timestamp_str}_cam{camera_id}.mp4"
                            recordings_base_path = os.path.join(app.root_path, '..', RECORDINGS_FOLDER)
                            file_path = os.path.join(recordings_base_path, filename)

                            new_event_file = EventFile(
                                event_id=new_event.id,
                                file_type='video_rgb',
                                file_path=filename
                            )
                            db.session.add(new_event_file)
                            db.session.commit()
                            
                            # 소켓을 통해 새 이벤트 전송 (전체 클라이언트에게)
                            event_data = new_event.to_dict()
                            socketio.emit('new_event', event_data)
                            print(f"새 이벤트 소켓 전송: {event_data}")
                            
                            threading.Thread(target=save_video_clip, args=(frame_buffer.copy(), file_path, FPS)).start()
                            break

            _, buffer_rgb = cv2.imencode('.jpg', annotated_frame_rgb)
            _, buffer_tir = cv2.imencode('.jpg', annotated_frame_tir)
            
            rgb_b64 = base64.b64encode(buffer_rgb).decode('utf-8')
            tir_b64 = base64.b64encode(buffer_tir).decode('utf-8')
            
            event_data = {
                'rgb': rgb_b64,
                'tir': tir_b64,
                'camera_id': 'test_video' if is_test_video else camera_id,
                'person_detected': is_person_detected
            }
            socketio.emit('video_frame', event_data, room=sid)
            socketio.sleep(1 / FPS)

    cap.release()
    if tir_cap:
        tir_cap.release()
    
    if is_multi_spectral:
        print(f"다중 스펙트럼 분석 스레드 종료. (RGB: {rgb_path}, TIR: {tir_path})")
    else:
        print(f"카메라 {camera_id + 1} 스트리밍 스레드 종료.")