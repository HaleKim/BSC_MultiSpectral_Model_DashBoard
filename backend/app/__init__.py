# /backend/app/__init__.py
import os
from flask import Flask
from .config import config
from .extensions import db, jwt, cors, socketio

# .env 파일에서 환경 변수를 로드합니다.

def create_app(config_name):
    """Flask 어플리케이션 팩토리 함수"""
    app = Flask(__name__)
    
    # 설정 로드
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)

    # 확장 초기화
    db.init_app(app)
    jwt.init_app(app)
    
    # 허용할 출처(origin) 목록을 명시적으로 정의합니다.
    # 이렇게 하면 허용된 주소에서만 백엔드와 통신할 수 있습니다.
    allowed_origins = [
        "http://localhost:3000",          # 내 PC에서 프론트엔드 개발 시
        "http://192.168.100.87:3000"      # 다른 PC에서 내 서버 IP로 접속 시
    ]
    
    # CORS 설정: 정의된 목록에 대해서만 API 요청을 허용합니다.
    cors.init_app(app, resources={r"/api/*": {"origins": allowed_origins}, r"/event_recordings/*": {"origins": allowed_origins}})
    # SocketIO 설정: 정의된 목록에 대해서만 소켓 연결을 허용합니다.
    socketio.init_app(app, cors_allowed_origins=allowed_origins)
    
    # 블루프린트 등록
    from .auth.routes import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    from .api.routes import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # WebSocket 이벤트 핸들러 등록
    from .sockets import events

    # 녹화 영상 서빙을 위한 정적 파일 라우트
    from flask import send_from_directory
    from .services.video_service import RECORDINGS_FOLDER

    @app.route(f'/{RECORDINGS_FOLDER}/<path:filename>')
    def serve_recording(filename):
        recordings_dir = os.path.join(app.root_path, '..', RECORDINGS_FOLDER)
        file_path = os.path.join(recordings_dir, filename)
        print(f"=== Static File Request ===")
        print(f"Requested filename: {filename}")
        print(f"Recordings directory: {recordings_dir}")
        print(f"Full file path: {file_path}")
        print(f"File exists: {os.path.exists(file_path)}")
        if os.path.exists(file_path):
            file_size = os.path.getsize(file_path)
            print(f"File size: {file_size} bytes")
            print(f"File size (KB): {file_size / 1024:.2f} KB")
        print(f"==========================")
        return send_from_directory(recordings_dir, filename)

    # 데이터베이스 테이블 생성
    # with app.app_context():
    #     db.create_all()

    return app