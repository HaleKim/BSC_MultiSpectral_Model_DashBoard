# /backend/app/api/routes.py

from flask import jsonify, current_app, request
from flask_jwt_extended import jwt_required, get_jwt
from functools import wraps
from . import api_bp
from ..extensions import db
from ..models.db_models import DetectionEvent, User, Camera
import os
# from werkzeug.security import generate_password_hash

def admin_required():
    def wrapper(fn):
        @wraps(fn)
        @jwt_required()
        def decorator(*args, **kwargs):
            claims = get_jwt()
            if claims.get("role") == "admin":
                return fn(*args, **kwargs)
            else:
                return jsonify(msg="관리자 권한이 필요합니다."), 403
        return decorator
    return wrapper

# @api_bp.route('/models', methods=['GET'])
# @jwt_required()
# def get_models():
#     """시스템에 등록된 모든 AI 모델 목록을 반환합니다."""
#     # 이 부분은 model_manager가 없으므로 임시 데이터로 응답하거나 구현해야 합니다.
#     # 현재 파일 구조에 model_manager.py가 없어서 임시 응답으로 대체합니다.
#     temp_models = [
#         {'name': 'yolo11n_early_fusion.pt', 'type': 'Early Fusion'},
#         {'name': 'yolo11n_mid_fusion.pt', 'type': 'Mid Fusion'}
#     ]
#     return jsonify(temp_models)

@api_bp.route('/events', methods=['GET'])
@jwt_required()
def get_events():
    """최근 발생한 이벤트 목록을 반환합니다."""
    events = DetectionEvent.query.order_by(DetectionEvent.timestamp.desc()).limit(20).all()
    return jsonify([event.to_dict() for event in events])

# --- 관리자 전용 API 엔드포인트 ---
@api_bp.route('/users', methods=['GET'])
@admin_required()
def get_all_users():
    """모든 사용자 목록을 반환합니다."""
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])

@api_bp.route('/users', methods=['POST'])
@admin_required()
def add_user():
    """신규 사용자를 추가합니다."""
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password') or not data.get('full_name'):
        return jsonify({"error": "필수 정보(username, password, full_name)가 누락되었습니다."}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({"error": "이미 존재하는 사용자 이름입니다."}), 409

    new_user = User(
        username=data['username'],
        full_name=data['full_name'],
        rank=data.get('rank'),
        role=data.get('role', 'USER')
    )
    new_user.set_password(data['password'])
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({"message": f"사용자 '{new_user.username}'가 성공적으로 추가되었습니다."}), 201

@api_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required()
def delete_user(user_id):
    """사용자를 삭제합니다."""
    user_to_delete = User.query.get_or_404(user_id)
    if user_to_delete.username == 'admin': # 'admin' 계정은 삭제 방지
        return jsonify({"error": "'admin' 사용자는 삭제할 수 없습니다."}), 403
        
    db.session.delete(user_to_delete)
    db.session.commit()
    return jsonify({"message": f"사용자 '{user_to_delete.username}'가 삭제되었습니다."}), 200

# --- 카메라 API 엔드포인트 (신규 추가) ---
@api_bp.route('/cameras', methods=['GET'])
@admin_required()
def get_all_cameras():
    """모든 카메라 목록을 반환합니다."""
    cameras = Camera.query.all()
    return jsonify([{
        "id": cam.id,
        "camera_name": cam.camera_name,
        "source": cam.source,
        "location": cam.location,
        "status": cam.status
    } for cam in cameras])
    
@api_bp.route('/cameras', methods=['POST'])
@admin_required()
def add_camera():
    data = request.get_json()
    if not data or not data.get('camera_name') or not data.get('source'):
        return jsonify({"error": "필수 정보(camera_name, source)가 누락되었습니다."}), 400

    new_cam = Camera(
        id=data.get('id'), # ID를 직접 지정할 수 있도록 허용
        camera_name=data['camera_name'],
        source=data['source'],
        location=data.get('location')
    )
    db.session.add(new_cam)
    db.session.commit()
    return jsonify({"message": "카메라가 성공적으로 추가되었습니다."}), 201

@api_bp.route('/cameras/<int:camera_id>', methods=['DELETE'])
@admin_required()
def delete_camera(camera_id):
    cam_to_delete = Camera.query.get_or_404(camera_id)
    db.session.delete(cam_to_delete)
    db.session.commit()
    return jsonify({"message": f"카메라 '{cam_to_delete.camera_name}'가 삭제되었습니다."}), 200

# --- 테스트 영상 목록 반환 API ---
@api_bp.route('/test_videos', methods=['GET'])
@jwt_required()
def get_test_videos():
    """/backend/test_videos/ 폴더에 있는 영상 파일 목록을 반환합니다."""
    try:
        test_videos_path = os.path.join(current_app.root_path, '..', 'test_videos')
        
        # # --- 디버깅 코드 ---
        # print(f"[*] 현재 확인 중인 절대 경로: {os.path.abspath(test_videos_path)}")
        # print(f"[*] 해당 경로에 폴더 존재 여부: {os.path.exists(test_videos_path)}")
        
        if not os.path.exists(test_videos_path):
            return jsonify([])

        video_files = [f for f in os.listdir(test_videos_path) if f.lower().endswith(('.mp4', '.avi', '.mov'))]
        return jsonify(video_files)
    except Exception as e:
        print(f"테스트 영상 목록을 불러오는 중 오류 발생: {e}")
        return jsonify({"error": "Failed to load video list"}), 500

# --- AI 모델 목록 반환 API ---
@api_bp.route('/models', methods=['GET'])
@jwt_required()
def get_models():
    """/backend/models_ai/ 폴더에 있는 .pt 모델 파일 목록을 반환합니다."""
    try:
        models_path = os.path.join(current_app.root_path, '..', 'models_ai')
        
        print(f"[*] 모델 폴더 경로: {os.path.abspath(models_path)}")
        print(f"[*] 모델 폴더 존재 여부: {os.path.exists(models_path)}")
        
        if not os.path.exists(models_path):
            # 기본 모델 목록 반환
            return jsonify(['yolo11n_early_fusion.pt', 'yolo11n_mid_fusion.pt', 'yolo11n.pt'])

        model_files = [f for f in os.listdir(models_path) if f.lower().endswith('.pt')]
        
        # 모델 파일이 없으면 기본 목록 반환
        if not model_files:
            return jsonify(['yolo11n_early_fusion.pt', 'yolo11n_mid_fusion.pt', 'yolo11n.pt'])
        
        print(f"[*] 발견된 모델 파일: {model_files}")
        return jsonify(model_files)
    except Exception as e:
        print(f"모델 목록을 불러오는 중 오류 발생: {e}")
        # 오류 시 기본 모델 목록 반환
        return jsonify(['yolo11n_early_fusion.pt', 'yolo11n_mid_fusion.pt', 'yolo11n.pt'])

# --- 기본 모델 설정 API ---
@api_bp.route('/default-model', methods=['GET'])
@jwt_required()
def get_default_model():
    """현재 설정된 기본 모델을 반환합니다."""
    try:
        import json
        settings_path = os.path.join(current_app.root_path, '..', 'settings.json')
        
        if os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                return jsonify({'default_model': settings.get('default_model', 'yolo11n_early_fusion.pt')}), 200
        else:
            return jsonify({'default_model': 'yolo11n_early_fusion.pt'}), 200
            
    except Exception as e:
        print(f"기본 모델 조회 중 오류: {str(e)}")
        return jsonify({'default_model': 'yolo11n_early_fusion.pt'}), 200

@api_bp.route('/default-model', methods=['POST'])
@admin_required()
def set_default_model():
    """서버의 기본 모델 설정을 업데이트합니다."""
    try:
        data = request.get_json()
        new_model = data.get('model')
        
        if not new_model:
            return jsonify({'error': '모델명이 필요합니다.'}), 400
        
        # 설정 파일 업데이트
        import json
        settings_path = os.path.join(current_app.root_path, '..', 'settings.json')
        
        settings = {
            'default_model': new_model
        }
        
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        
        print(f"기본 모델 설정 업데이트: {new_model}")
        return jsonify({'message': f'기본 모델이 {new_model}로 설정되었습니다.'}), 200
        
    except Exception as e:
        print(f"기본 모델 설정 중 오류: {str(e)}")
        return jsonify({'error': '기본 모델 설정에 실패했습니다.'}), 500