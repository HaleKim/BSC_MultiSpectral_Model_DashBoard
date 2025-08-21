# /backend/app/sockets/events.py

import os
from flask import current_app, request
from flask_socketio import emit
from ..extensions import socketio
from ..services.video_service import start_video_processing
import logging
import eventlet

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 수정: 클라이언트(sid)별로 여러 비디오 작업(camera_id: task)을 저장하도록 구조 변경
video_tasks = {}

@socketio.on('connect')
def handle_connect():
    logger.info(f"클라이언트 연결됨: {request.sid}")
    video_tasks[request.sid] = {} # 클라이언트 연결 시 작업 딕셔너리 초기화
    emit('response', {'message': '서버에 연결되었습니다.'})

@socketio.on('disconnect')
def handle_disconnect():
    client_sid = request.sid
    logger.info(f"클라이언트 연결 끊어짐: {client_sid}")
    
    # 해당 클라이언트가 실행 중인 모든 비디오 작업을 종료
    if client_sid in video_tasks:
        # 사전 변경 중 반복 오류 방지를 위해 복사본 사용
        tasks_to_kill = list(video_tasks[client_sid].items())
        for camera_id, task in tasks_to_kill:
            try:
                task.kill()
                logger.info(f"카메라 {camera_id} 스트리밍 작업 종료: {client_sid}")
            except Exception as e:
                logger.error(f"작업 종료 오류 (카메라 {camera_id}): {e}")
        
        # 모든 작업 종료 후 한 번만 대기 (시간 단축)
        if tasks_to_kill:
            import time
            time.sleep(0.05)  # 50ms로 단축
        
        # 클라이언트 작업 딕셔너리 정리
        try:
            del video_tasks[client_sid]
        except KeyError:
            pass  # 이미 삭제된 경우 무시
    
    # 비디오 제어 상태도 정리
    try:
        from ..services.video_service import clear_test_video_control
        clear_test_video_control(client_sid)
    except Exception as e:
        logger.error(f"비디오 제어 상태 정리 오류: {e}")

@socketio.on('start_stream')
def handle_start_stream(data):
    client_sid = request.sid
    camera_id = data.get('camera_id')
    model_name = data.get('model')

    if camera_id is None:
        emit('error', {'message': 'Camera ID is required.'}, room=client_sid)
        return

    if client_sid in video_tasks and camera_id in video_tasks.get(client_sid, {}):
        logger.warning(f"Camera {camera_id} is already streaming for client {client_sid}")
        return

    # 모델이 명시적으로 제공되지 않으면 기본 모델을 로드
    if not model_name:
        try:
            import json
            settings_path = os.path.join(current_app.root_path, '..', 'settings.json')
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                model_name = settings.get('default_model', 'yolo11n_early_fusion.pt')
            logger.info(f"Using default model: {model_name}")
        except Exception as e:
            logger.error(f"Failed to load default model, falling back. Error: {e}")
            model_name = 'yolo11n_early_fusion.pt'

    user_id = data.get('user_id')

    logger.info(f"[실시간 스트림 시작 요청] camera_id={camera_id}, model={model_name}, client={client_sid}")

    # 일관된 stream_config 생성
    stream_config = {
        'camera_id': camera_id,
        'model': model_name,
        'user_id': user_id,
        'is_live_stream': True,
        'is_multi_spectral': 'fusion' in model_name # 모델 이름에 'fusion'이 있으면 다중 스펙트럼으로 간주
    }

    task = eventlet.spawn(
        start_video_processing,
        current_app._get_current_object(),
        client_sid,
        stream_config
    )
    video_tasks[client_sid][camera_id] = task

@socketio.on('stop_stream')
def handle_stop_stream(data):
    client_sid = request.sid
    camera_id = data.get('camera_id')

    if camera_id is None:
        return

    if client_sid in video_tasks and camera_id in video_tasks[client_sid]:
        task = video_tasks[client_sid].pop(camera_id)
        task.kill()
        logger.info(f"[실시간 스트림 중지] 사용자 요청으로 카메라 {camera_id} 스트리밍 중지: {client_sid}")
        emit('response', {'message': f'카메라 {camera_id} 스트리밍을 중지합니다.'})
    else:
        logger.warning(f"[실시간 스트림 중지] 중지할 스트리밍 작업이 없습니다: camera_id={camera_id}, client={client_sid}")

# --- 시험 영상 분석 핸들러 (다중 스펙트럼 버전) ---
@socketio.on('start_test_stream')
def handle_start_test_stream(data):
    client_sid = request.sid
    
    if client_sid in video_tasks and 'test_video' in video_tasks.get(client_sid, {}):
        logger.warning(f"Stopping existing test video analysis for client {client_sid}")
        task = video_tasks[client_sid].pop('test_video')
        task.kill()
        eventlet.sleep(0.5) # Use eventlet sleep

    rgb_filename = data.get('rgb_filename')
    tir_filename = data.get('tir_filename')
    model_name = data.get('model', 'yolo11n_early_fusion.pt')
    
    if not rgb_filename:
        emit('error', {'message': 'RGB video filename is required.'}, room=client_sid)
        return

    # Basic security check for filename
    if any('..' in f or '/' in f or '\\' in f for f in [rgb_filename, tir_filename] if f):
        emit('error', {'message': 'Invalid filename.'}, room=client_sid)
        return

    rgb_path = os.path.join(current_app.root_path, '..', 'test_videos', rgb_filename)
    if not os.path.exists(rgb_path):
        emit('error', {'message': f"RGB video '{rgb_filename}' not found."}, room=client_sid)
        return

    tir_path = None
    if tir_filename:
        tir_path = os.path.join(current_app.root_path, '..', 'test_videos', tir_filename)
        if not os.path.exists(tir_path):
            emit('error', {'message': f"TIR video '{tir_filename}' not found."}, room=client_sid)
            return

    logger.info(f"Requesting to start test stream: RGB={rgb_filename}, TIR={tir_filename}, Model={model_name}, client={client_sid}")
    
    # 일관된 stream_config 생성
    stream_config = {
        'rgb_path': rgb_path,
        'tir_path': tir_path,
        'model': model_name,
        'is_live_stream': False,
        'is_multi_spectral': bool(tir_path) # TIR 경로가 있으면 다중 스펙트럼으로 간주
    }
    
    task = eventlet.spawn(
        start_video_processing,
        current_app._get_current_object(),
        client_sid,
        stream_config
    )
    
    if client_sid not in video_tasks:
        video_tasks[client_sid] = {}
    video_tasks[client_sid]['test_video'] = task
    
    emit('response', {'message': f"Starting multi-spectral analysis. (RGB: {rgb_filename}, TIR: {tir_filename}, Model: {model_name})"})

@socketio.on('stop_test_stream')
def handle_stop_test_stream(data):
    client_sid = request.sid
    
    if client_sid in video_tasks and 'test_video' in video_tasks[client_sid]:
        task = video_tasks[client_sid].pop('test_video')
        task.kill()
        logger.info(f"사용자 요청으로 시험 영상 분석 중지 및 정리 완료: {client_sid}")
        emit('response', {'message': '시험 영상 분석을 중지했습니다.'})
    else:
        logger.warning(f"중지할 시험 영상 분석 작업이 없습니다: {client_sid}")

@socketio.on('test_video_control')
def handle_test_video_control(data):
    """시험 영상 재생 제어 (일시정지/재생/시간이동/속도변경)"""
    client_sid = request.sid
    action = data.get('action')
    
    logger.info(f"시험 영상 제어 요청: {action}, 클라이언트: {client_sid}, 데이터: {data}")
    
    # 비디오 서비스의 제어 함수 호출
    from ..services.video_service import set_test_video_control
    
    if action == 'pause':
        set_test_video_control(client_sid, 'pause', time=data.get('time', 0))
    elif action == 'play':
        set_test_video_control(client_sid, 'play', time=data.get('time', 0))
    elif action == 'seek':
        set_test_video_control(client_sid, 'seek', time=data.get('time', 0))
    elif action == 'playback_rate':
        set_test_video_control(client_sid, 'playback_rate', rate=data.get('rate', 1.0))
    
    emit('response', {'message': f'비디오 제어 명령 처리 완료: {action}'})