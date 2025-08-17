# /backend/run.py
import eventlet
eventlet.monkey_patch()
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