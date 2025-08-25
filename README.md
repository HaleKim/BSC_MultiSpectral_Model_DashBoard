# BSC MultiSpectral Model DashBoard

본 프로젝트는 RGB 및 열화상(TIR) 카메라 영상을 AI 모델로 분석하여 객체(사람, 멧돼지, 고라니 등)를 탐지하고, 관련 이벤트를 관리 및 모니터링하는 웹 기반 대시보드입니다.

## 1. 개요

- **실시간 영상 스트리밍**: RGB 및 TIR 카메라 영상을 웹 대시보드에서 실시간으로 확인할 수 있습니다.
- **AI 객체 탐지**: YOLO AI 모델을 사용하여 영상 내에서 특정 객체를 탐지하고 위치를 표시합니다.
- **이벤트 기록 및 관리**: 객체 탐지 시 이벤트가 발생하며, 이벤트 목록과 상세 정보를 조회하고 관리할 수 있습니다.
- **사용자 인증**: 로그인 기능을 통해 허가된 사용자만 시스템에 접근할 수 있습니다.
- **관리자 기능**: 사용자 관리, 시스템 설정 등 관리자 전용 기능을 제공합니다.

## 2. 기술 스택

### Backend
- **Framework**: Flask, Flask-SocketIO
- **Database**: SQLAlchemy, MySQL
- **AI & Image Processing**: PyTorch, Ultralytics (YOLO), OpenCV
- **Authentication**: Flask-JWT-Extended
- **WSGI Server**: Eventlet

### Frontend
- **Library**: React.js
- **State Management**: React Context API
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **WebSocket**: Socket.io-client

## 3. 설치 및 실행 방법

### 3.1. 사전 요구사항
- Python 3.8 이상
- Node.js 14.x 이상 및 npm
- Git

### 3.2. Backend 설정

1.  **저장소 복제**
    ```bash
    git clone https://github.com/your-repository/BSC_MultiSpectral_Model_DashBoard.git
    cd BSC_MultiSpectral_Model_DashBoard/backend
    ```

2.  **가상 환경 생성 및 활성화**
    ```bash
    python -m venv venv
    source venv/bin/activate  # Linux/macOS
    .\venv\Scripts\activate  # Windows
    ```

3.  **필요 라이브러리 설치**
    ```bash
    pip install -r requirements.txt
    ```
    > **참고**: PyTorch는 시스템(CUDA) 환경에 따라 설치 방법이 다를 수 있습니다. `requirements.txt`에는 CPU 버전이 명시되어 있습니다. GPU를 사용하려면 [PyTorch 공식 홈페이지](https://pytorch.org/)를 참고하여 환경에 맞는 버전을 설치하세요.

4.  **데이터베이스 설정**
    - 본 프로젝트는 Flask-SQLAlchemy를 사용하여 데이터베이스 스키마를 관리합니다.
    - `backend/app/config.py` 파일에서 `SQLALCHEMY_DATABASE_URI`를 자신의 DB 환경에 맞게 수정할 수 있습니다. (기본은 `mysql-connector-python`을 사용하도록 설정되어 있습니다.)
    - 서버를 처음 실행하면 `db.create_all()`에 의해 필요한 모든 테이블이 자동으로 생성됩니다. 별도의 DB 마이그레이션 과정은 필요하지 않습니다.

5.  **AI 모델 다운로드**
    - `backend/models_ai/` 디렉토리에 사용하려는 YOLO 모델 파일(`.pt`)을 위치시킵니다.

6.  **백엔드 서버 실행**
    ```bash
    python run.py
    ```

### 3.3. Frontend 설정

1.  **프론트엔드 디렉토리로 이동**
    ```bash
    cd ../frontend
    ```

2.  **필요 라이브러리 설치**
    ```bash
    npm install
    ```

3.  **프론트엔드 개발 서버 실행**
    ```bash
    npm start
    ```
    서버가 실행되면 자동으로 브라우저에서 `http://localhost:3000` 주소로 대시보드가 열립니다.

### 3.4. Video Codec 설정

현재 프로젝트에서 event_recordings/ 에 저장되는 비디오 파일들은 H264-mp4 형식입니다. 비디오를 형식에 맞춰 저장하기 위해 가상환경의 python.exe 파일과 같은 경로에 openh264-1.8.0-win64.dll 파일을 옮겨주세요.

## 4. 백엔드 라이브러리 (`requirements.txt`)

```
# /backend/requirements.txt

# 웹 프레임워크 및 WebSocket
Flask==2.2.2
Werkzeug==2.2.2
Flask-SocketIO==5.3.3
Flask-Cors==3.0.10

# 데이터베이스
Flask-SQLAlchemy==2.5.1
SQLAlchemy==1.4.39
mysql-connector-python==8.0.30

# 인증 (JSON Web Token)
Flask-JWT-Extended==4.4.4
Flask-Login==0.6.2

# AI 및 이미지 처리
# PyTorch는 CUDA 버전에 따라 설치 방법이 다르므로, 공식 홈페이지를 참고하는 것이 가장 좋습니다.
# 아래는 CPU 버전 기준입니다.
torch==2.1.0
torchvision==0.16.0
ultralytics
opencv-python-headless==4.8.0.76
numpy==1.26.2

# 기타
python-dotenv==0.21.0 # .env 파일 로드
PyYAML==6.0 # models.yaml 파싱
eventlet==0.33.3 # SocketIO를 위한 고성능 서버
```

## 5. 프로젝트 구조

```
BSC_MultiSpectral_Model_DashBoard/
├── backend/                  # 백엔드 Flask 애플리케이션
│   ├── app/                  # Flask 애플리케이션 모듈
│   │   ├── api/              # REST API 라우트
│   │   ├── auth/             # 인증 관련 라우트
│   │   ├── models/           # DB 모델(스키마)
│   │   ├── services/         # 비즈니스 로직 (영상 처리 등)
│   │   ├── sockets/          # WebSocket 이벤트 핸들러
│   │   ├── config.py         # 설정 파일
│   │   └── __init__.py       # 앱 팩토리
│   ├── models_ai/            # AI 모델 파일 (.pt)
│   ├── test_videos/          # 테스트용 영상 파일
│   ├── run.py                # 서버 실행 스크립트
│   └── requirements.txt      # Python 라이브러리 목록
└── frontend/                 # 프론트엔드 React 애플리케이션
    ├── src/
    │   ├── components/       # 재사용 가능한 React 컴포넌트
    │   ├── context/          # React Context (인증 등)
    │   ├── pages/            # 페이지 단위 컴포넌트
    │   ├── services/         # API 연동 및 소켓 서비스
    │   └── App.js            # 메인 애플리케이션 컴포넌트
    ├── public/
    └── package.json          # Node.js 라이브러리 목록
```
