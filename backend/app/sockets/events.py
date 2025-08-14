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
    logger.info(f"클라이언트 연결 끊어짐: {request.sid}")
    # 해당 클라이언트가 실행 중인 모든 비디오 작업을 종료
    if request.sid in video_tasks:
        for camera_id, task in video_tasks[request.sid].items():
            task.kill()
            logger.info(f"카메라 {camera_id + 1} 스트리밍 작업 종료: {request.sid}")
        del video_tasks[request.sid]

@socketio.on('start_stream')
def handle_start_stream(data):
    client_sid = request.sid
    camera_id = data.get('camera_id') 
    model = data.get('model')  # 선택된 모델 (관리자용)

    if camera_id is None:
        return
        
    # 이미 해당 카메라 스트림이 실행 중이면 중복 실행 방지
    if client_sid in video_tasks and camera_id in video_tasks[client_sid]:
        logger.warning(f"카메라 {camera_id + 1}는 이미 스트리밍 중입니다: {client_sid}")
        return

    logger.info(f"스트리밍 시작 요청: camera_id={camera_id}, model={model}, client={client_sid}")

    # 실시간 감시용 파라미터 구성
    stream_params = camera_id
    if model:
        # 관리자가 모델을 선택한 경우
        stream_params = {
            'camera_id': camera_id,
            'model': model,
            'is_live_stream': True
        }
    else:
        # 기본 모델 사용 (settings.json에서 읽어옴)
        try:
            import json
            settings_path = os.path.join(current_app.root_path, '..', 'settings.json')
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                default_model = settings.get('default_model', 'yolo11n_early_fusion.pt')
            
            stream_params = {
                'camera_id': camera_id,
                'model': default_model,
                'is_live_stream': True
            }
            logger.info(f"기본 모델 사용: {default_model}")
        except Exception as e:
            logger.error(f"기본 모델 로드 실패, 기존 방식 사용: {e}")
            stream_params = camera_id

    task = eventlet.spawn(
        start_video_processing,
        current_app._get_current_object(),
        stream_params,
        client_sid,
        True  # emit_start_message=True (video_service에서 정확한 모델명으로 메시지 전송)
    )
    video_tasks[client_sid][camera_id] = task
    
    # 메시지는 video_service.py에서 실제 모델 정보와 함께 전송됨

@socketio.on('stop_stream')
def handle_stop_stream(data):
    client_sid = request.sid
    camera_id = data.get('camera_id')

    if camera_id is None:
        return

    if client_sid in video_tasks and camera_id in video_tasks[client_sid]:
        task = video_tasks[client_sid].pop(camera_id)
        task.kill()
        logger.info(f"사용자 요청으로 카메라 {camera_id + 1} 스트리밍 중지: {client_sid}")
        emit('response', {'message': f'카메라 {camera_id + 1} 스트리밍을 중지합니다.'})
    else:
        logger.warning(f"중지할 스트리밍 작업이 없습니다: camera_id={camera_id}, client={client_sid}")

# --- 시험 영상 분석 핸들러 (다중 스펙트럼 버전) ---
@socketio.on('start_test_stream')
def handle_start_test_stream(data):
    client_sid = request.sid
    
    # 다른 테스트 영상이 실행 중이면 중지하고 완전히 정리
    if client_sid in video_tasks and 'test_video' in video_tasks[client_sid]:
        logger.warning(f"기존 시험 영상 분석 중지 및 정리: {client_sid}")
        task = video_tasks[client_sid].pop('test_video')
        task.kill()
        # 잠시 대기하여 이전 작업이 완전히 종료되도록 함
        import time
        time.sleep(0.5)
    
    # 다중 스펙트럼 분석을 위한 파라미터 추출
    rgb_filename = data.get('rgb_filename') or data.get('filename')  # 하위 호환성
    tir_filename = data.get('tir_filename') or data.get('filename')  # 하위 호환성
    model = data.get('model', 'yolo11n_early_fusion.pt')
    
    if not rgb_filename:
        emit('error', {'message': 'RGB 영상 파일 이름이 필요합니다.'}, room=client_sid)
        return

    # 파일 이름 보안 검사
    for filename in [rgb_filename, tir_filename]:
        if filename and ('..' in filename or '/' in filename or '\\' in filename):
            emit('error', {'message': '잘못된 파일 이름입니다.'}, room=client_sid)
            return

    # 파일 경로 확인
    rgb_path = os.path.join(current_app.root_path, '..', 'test_videos', rgb_filename)
    tir_path = os.path.join(current_app.root_path, '..', 'test_videos', tir_filename) if tir_filename else rgb_path

    if not os.path.exists(rgb_path):
        emit('error', {'message': f"RGB 영상 '{rgb_filename}' 파일을 찾을 수 없습니다."}, room=client_sid)
        return
    
    if tir_filename and not os.path.exists(tir_path):
        emit('error', {'message': f"TIR 영상 '{tir_filename}' 파일을 찾을 수 없습니다."}, room=client_sid)
        return

    logger.info(f"시험 영상 스트리밍 시작 요청: RGB={rgb_filename}, TIR={tir_filename}, Model={model}, client={client_sid}")
    
    # 분석 파라미터를 포함한 딕셔너리 전달
    analysis_params = {
        'rgb_path': rgb_path,
        'tir_path': tir_path,
        'model': model,
        'is_multi_spectral': True
    }
    
    task = eventlet.spawn(
        start_video_processing,
        current_app._get_current_object(),
        analysis_params,  # 분석 파라미터 전달
        client_sid,
        False  # emit_start_message=False (테스트 모드는 별도 메시지)
    )
    # 테스트 영상은 'test_video'라는 특별한 키로 관리
    video_tasks[client_sid]['test_video'] = task
    emit('response', {'message': f"다중 스펙트럼 영상 분석을 시작합니다. (RGB: {rgb_filename}, TIR: {tir_filename}, Model: {model})"})

@socketio.on('stop_test_stream')
def handle_stop_test_stream(data):
    client_sid = request.sid
    
    if client_sid in video_tasks and 'test_video' in video_tasks[client_sid]:
        task = video_tasks[client_sid].pop('test_video')
        task.kill()
        # 완전한 정리를 위한 대기
        import time
        time.sleep(0.3)
        logger.info(f"사용자 요청으로 시험 영상 분석 중지 및 정리 완료: {client_sid}")
        emit('response', {'message': '시험 영상 분석을 중지했습니다.'})
    else:
        logger.warning(f"중지할 시험 영상 분석 작업이 없습니다: {client_sid}")