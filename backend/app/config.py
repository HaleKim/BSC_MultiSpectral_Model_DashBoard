# /backend/app/config.py
import os
from datetime import timedelta
from pathlib import Path

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'default-fallback-key')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # JWT 설정
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1) # 토큰 유효 시간

    @staticmethod
    def init_app(app):
        pass

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    # 만약 DATABASE_URL이 .env 파일에 없다면, 더 명확한 오류를 발생시킵니다.
    if not SQLALCHEMY_DATABASE_URI:
        raise ValueError("DATABASE_URL이 .env 파일에 설정되지 않았습니다.")

class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')

BASE_DIR = Path(__file__).resolve().parents[1]  # backend/
RECORD_DIR = Path(os.getenv("RECORD_DIR", BASE_DIR / "event_recordings"))
RECORD_DIR.mkdir(parents=True, exist_ok=True)

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}