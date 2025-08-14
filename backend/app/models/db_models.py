# /backend/app/models/db_models.py

import datetime
from ..extensions import db, login_manager
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

class User(UserMixin, db.Model):
    """사용자 정보를 저장하는 데이터베이스 모델 (SQL 스키마와 동기화)"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(50), nullable=False)  # full_name 필드 추가
    rank = db.Column(db.String(50), nullable=True)        # rank 필드 추가
    role = db.Column(db.String(10), nullable=False, default='USER')
    created_at = db.Column(db.TIMESTAMP, nullable=False, default=datetime.datetime.utcnow) # created_at 필드 추가

    # User와 DetectionEvent 간의 관계 설정
    events_on_duty = db.relationship('DetectionEvent', backref='user_on_duty', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        return self.role == 'ADMIN'

    def to_dict(self):
        """사용자 정보를 딕셔너리로 변환"""
        return {
            'id': self.id,
            'username': self.username,
            'full_name': self.full_name,
            'rank': self.rank,
            'role': self.role
        }

    def __repr__(self):
        return f'<User {self.username}>'

class Camera(db.Model):
    """카메라 정보를 저장하는 데이터베이스 모델 (신규 추가)"""
    __tablename__ = 'cameras'

    id = db.Column(db.Integer, primary_key=True)
    camera_name = db.Column(db.String(100), nullable=False)
    source = db.Column(db.String(255), nullable=False)
    location = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(20), nullable=False, default='ACTIVE')

    # Camera와 DetectionEvent 간의 관계 설정
    detection_events = db.relationship('DetectionEvent', backref='camera', lazy=True)

    def __repr__(self):
        return f'<Camera {self.id}: {self.camera_name}>'

class DetectionEvent(db.Model):
    """탐지 이벤트를 저장하는 데이터베이스 모델 (기존 Event 모델 대체)"""
    __tablename__ = 'detection_events'

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)
    camera_id = db.Column(db.Integer, db.ForeignKey('cameras.id'), nullable=False)
    detected_object = db.Column(db.String(50), nullable=False) # event_type -> detected_object
    confidence = db.Column(db.Float, nullable=False) # confidence 필드 추가
    user_id_on_duty = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True) # user_id -> user_id_on_duty

    # DetectionEvent와 EventFile 간의 관계 설정 (하나의 이벤트가 여러 파일을 가짐)
    files = db.relationship('EventFile', backref='event', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        """프론트엔드가 요구하는 형식에 맞춰 이벤트 정보를 딕셔너리로 변환"""
        # 관련된 파일들을 타입별로 정리
        file_paths = {file.file_type: file.file_path for file in self.files}
        
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() + 'Z',
            'camera_id': self.camera_id,
            'camera_name': self.camera.camera_name if self.camera else 'N/A',
            'location': self.camera.location if self.camera else 'N/A',
            'detected_object': self.detected_object,
            'confidence': f"{self.confidence:.2f}",
            'user_name': self.user_on_duty.full_name if self.user_on_duty else 'N/A',
            # 프론트엔드 EventList 컴포넌트가 기대하는 키 값으로 파일 경로 전달
            'thumbnail_path': file_paths.get('thumbnail', 'default_thumbnail.jpg'),
            'video_path_rgb': file_paths.get('video_rgb', ''),
            'video_path_tid': file_paths.get('video_tid', ''),
        }

    def __repr__(self):
        return f'<DetectionEvent {self.id} - {self.detected_object}>'

class EventFile(db.Model):
    """이벤트 관련 파일을 저장하는 데이터베이스 모델 (신규 추가)"""
    __tablename__ = 'event_files'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('detection_events.id'), nullable=False)
    file_type = db.Column(db.String(20), nullable=False)  # e.g., 'video_rgb', 'thumbnail'
    file_path = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f'<EventFile {self.id} for Event {self.event_id}>'