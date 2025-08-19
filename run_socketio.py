# run_socketio.py
from backend.app import create_app
from backend.app.extensions import socketio

# development 환경으로 앱 생성
app = create_app('development')

if __name__ == "__main__":
    # eventlet 모드에서는 flask run 대신 socketio.run 사용
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)