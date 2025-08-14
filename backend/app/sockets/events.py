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

    if camera_id is None:
        return
        
    # 이미 해당 카메라 스트림이 실행 중이면 중복 실행 방지
    if client_sid in video_tasks and camera_id in video_tasks[client_sid]:
        logger.warning(f"카메라 {camera_id + 1}는 이미 스트리밍 중입니다: {client_sid}")
        return

    logger.info(f"스트리밍 시작 요청: camera_id={camera_id}, client={client_sid}")

    task = eventlet.spawn(
        start_video_processing,
        current_app._get_current_object(),
        camera_id,
        client_sid
    )
    video_tasks[client_sid][camera_id] = task
    emit('response', {'message': f'카메라 {camera_id + 1} 스트리밍을 시작합니다.'})

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

# --- 시험 영상 분석 핸들러 (기존과 유사하게 단일 스트림으로 관리) ---
@socketio.on('start_test_stream')
def handle_start_test_stream(data):
    client_sid = request.sid
    
    # 다른 테스트 영상이 실행 중이면 중지
    if client_sid in video_tasks and 'test_video' in video_tasks[client_sid]:
        logger.warning(f"기존 시험 영상 분석 중지: {client_sid}")
        task = video_tasks[client_sid].pop('test_video')
        task.kill()
        
    filename = data.get('filename')
    if not filename:
        emit('error', {'message': '영상 파일 이름이 필요합니다.'}, room=client_sid)
        return

    if '..' in filename or '/' in filename or '\\' in filename:
        emit('error', {'message': '잘못된 파일 이름입니다.'}, room=client_sid)
        return

    video_path = os.path.join(current_app.root_path, '..', 'test_videos', filename)

    if not os.path.exists(video_path):
        emit('error', {'message': f"'{filename}' 파일을 찾을 수 없습니다."}, room=client_sid)
        return

    logger.info(f"시험 영상 스트리밍 시작 요청: {filename}, client={client_sid}")
    
    task = eventlet.spawn(
        start_video_processing,
        current_app._get_current_object(),
        video_path, # camera_id 대신 파일 경로 전달
        client_sid
    )
    # 테스트 영상은 'test_video'라는 특별한 키로 관리
    video_tasks[client_sid]['test_video'] = task
    emit('response', {'message': f"시험 영상 '{filename}' 분석을 시작합니다."})