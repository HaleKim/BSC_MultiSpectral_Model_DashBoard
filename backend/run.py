# /backend/run.py
import eventlet
# OpenCV와의 호환성을 위해 일부 모듈만 패치
eventlet.monkey_patch(socket=True, select=True, thread=False, time=True)
from dotenv import load_dotenv
import os
import logging

# 다른 모든 코드가 실행되기 전에 .env 파일을 가장 먼저 로드합니다.
# .env 파일의 경로를 명시적으로 지정해주는 것이 가장 확실합니다.
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

# 이제 환경 변수가 로드되었으므로, app 모듈을 임포트합니다.
from app import create_app, socketio
from app.services.video_service import RECORDINGS_FOLDER # <-- 설정값 임포트

# 개발 환경 설정으로 어플리케이션 인스턴스 생성
app = create_app(os.getenv('FLASK_ENV') or 'development')

# --- Graceful Shutdown ---
from app.sockets.events import video_tasks
import signal
import sys

def signal_handler(sig, frame):
    print('\nCtrl+C가 감지되었습니다. 서버를 종료합니다...')
    
    # 모든 활성 비디오 처리 스레드 종료
    tasks_to_kill = []
    for sid in list(video_tasks.keys()):
        if sid in video_tasks:
            for camera_id in list(video_tasks[sid].keys()):
                if camera_id in video_tasks[sid]:
                    task = video_tasks[sid].pop(camera_id)
                    tasks_to_kill.append((task, sid, camera_id))

    if not tasks_to_kill:
        print("  - 종료할 백그라운드 작업이 없습니다.")
    else:
        print(f"총 {len(tasks_to_kill)}개의 백그라운드 작업을 종료합니다...")
        for task, sid, camera_id in tasks_to_kill:
            print(f"  - 클라이언트 {sid}의 카메라 {camera_id} 작업 종료 중...")
            try:
                task.kill()
            except Exception as e:
                print(f"    - 작업 종료 중 오류 발생: {e}")

    print("모든 백그라운드 작업이 정리되었습니다.")
    
    # 소켓 서버 정상 종료 (eventlet/gevent 사용 시 필요)
    # 이 함수는 socketio.run() 루프를 중단시킵니다.
    socketio.stop() 
    
    print("Socket.IO 서버가 중지되었습니다. 프로세스를 종료합니다.")
    # sys.exit(0) # socketio.stop()이 루프를 빠져나오게 하므로, 스크립트는 자연스럽게 종료됩니다.

signal.signal(signal.SIGINT, signal_handler)


if __name__ == '__main__':

    # --- 서버 시작 시 녹화 폴더 생성 ---
    recordings_dir = os.path.join(os.path.dirname(__file__), RECORDINGS_FOLDER)
    if not os.path.exists(recordings_dir):
        os.makedirs(recordings_dir)
        print(f"'{recordings_dir}' 폴더를 생성했습니다.")
        
    # 서버가 알고 있는 모든 URL 경로를 출력합니다. - for debugging
    # with app.app_context():
    #     print("="*50)
    #     print("REGISTERED URL ROUTES:")
    #     for rule in app.url_map.iter_rules():
    #         print(f"- Endpoint: {rule.endpoint}, Methods: {rule.methods}, URL: {rule.rule}")
    #     print("="*50)

    print("Flask-SocketIO 서버를 http://0.0.0.0:5001 에서 시작합니다...")
    socketio.run(app, host='0.0.0.0', port=5001, use_reloader=False, log_output=False)