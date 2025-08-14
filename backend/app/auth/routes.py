# /backend/app/auth/routes.py
import os
from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from . import auth_bp
from ..models.db_models import User

@auth_bp.route('/login', methods=['POST'])
def login():
    """사용자 로그인 및 JWT 발급"""
    data = request.get_json()
    username = data.get('username', None)
    password = data.get('password', None)

    user = User.query.filter_by(username=username).first()

    if user and user.check_password(password):
        # JWT 생성 (사용자 ID와 역할을 담음)
        additional_claims = {"role": user.role}
        access_token = create_access_token(
            identity=str(user.id), additional_claims=additional_claims
        )
        return jsonify(access_token=access_token)
    
    return jsonify({"msg": "아이디 또는 비밀번호가 잘못되었습니다."}), 401

@auth_bp.route('/profile')
@jwt_required() # 이 엔드포인트는 유효한 JWT가 필요함
def profile():
    """현재 로그인된 사용자 정보 반환"""
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if user:
        return jsonify(id=user.id, username=user.username, role=user.role)
    return jsonify({"msg": "사용자를 찾을 수 없습니다."}), 404