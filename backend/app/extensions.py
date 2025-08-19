# /backend/app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_login import LoginManager

db = SQLAlchemy()
jwt = JWTManager()
cors = CORS()
# 비동기 모드로 eventlet을 사용하도록 명시
#socketio = SocketIO(async_mode='eventlet')
socketio = SocketIO(async_mode="threading")
login_manager = LoginManager()