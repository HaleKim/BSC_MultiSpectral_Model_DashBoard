# BSC 다중 스펙트럼 모델 대시보드 시스템 보고서

## 1. 시스템 아키텍처 개요

본 시스템은 실시간으로 입력되는 다중 스펙트럼(RGB, TIR) 영상 데이터를 분석하여 특정 객체(사람, 멧돼지, 고라니 등)를 탐지하고, 관련 이벤트를 관리자에게 알리는 것을 목표로 합니다. 시스템은 크게 다음과 같은 구성 요소로 이루어진 클라이언트-서버 아키텍처를 따릅니다.

-   **프론트엔드 (Frontend)**: 사용자 인터페이스(UI)를 제공하는 웹 애플리케이션입니다. React 프레임워크를 기반으로 구축되었으며, 관리자는 이를 통해 실시간 영상 스트림, 탐지 이벤트 로그, 시스템 설정 등을 확인하고 제어할 수 있습니다.
-   **백엔드 (Backend)**: Python의 Flask 프레임워크를 기반으로 하는 API 서버입니다. 비디오 스트림 처리, AI 모델 연동, 데이터베이스 관리, 사용자 인증 및 실시간 이벤트 전송 등 시스템의 핵심 로직을 담당합니다.
-   **AI 모델 (AI Model)**: PyTorch 기반의 YOLO(You Only Look Once) 객체 탐지 모델을 사용합니다. 특히 다중 스펙트럼 영상의 'Early Fusion'을 위해 커스터마이징된 모델(`yolo11n_early_fusion.pt`)이 핵심적인 역할을 수행합니다.
-   **데이터베이스 (Database)**: MySQL 데이터베이스를 사용하여 사용자 정보, 카메라 정보, 탐지 이벤트 등 시스템의 영구 데이터를 저장하고 관리합니다.
-   **실시간 통신 (Real-time Communication)**: Flask-SocketIO와 `socket.io-client`를 사용하여 백엔드와 프론트엔드 간의 양방향 실시간 통신을 구현합니다. 이를 통해 영상 프레임과 탐지 이벤트를 지연 없이 대시보드에 전송합니다.

## 2. 데이터베이스 구현 내용

시스템의 데이터 영속성은 `Flask-SQLAlchemy` ORM(Object-Relational Mapper)을 통해 관리되며, 주요 데이터베이스 모델은 다음과 같습니다.

-   **`User`**: 시스템 사용자 정보를 저장합니다.
    -   `id`: 기본 키
    -   `username`, `password_hash`: 로그인 계정 정보
    -   `full_name`, `rank`: 사용자 이름 및 직급
    -   `role`: 사용자 권한 ('ADMIN' 또는 'USER')
-   **`Camera`**: 감시 카메라의 정보를 관리합니다.
    -   `id`: 기본 키
    -   `camera_name`, `location`: 카메라 이름 및 위치
    -   `source`: 비디오 스트림 주소 (RTSP 등)
    -   `status`: 카메라 상태 ('ACTIVE', 'INACTIVE')
-   **`DetectionEvent`**: AI 모델이 객체를 탐지했을 때 발생하는 이벤트 정보를 기록합니다.
    -   `id`: 기본 키
    -   `timestamp`: 이벤트 발생 시각
    -   `camera_id`: 이벤트가 발생한 카메라의 외래 키
    -   `detected_object`: 탐지된 객체의 종류 ('person', 'scrofa' 등)
    -   `confidence`: 탐지 신뢰도
    -   `user_id_on_duty`: 당시 근무자의 외래 키
-   **`EventFile`**: 각 탐지 이벤트와 관련된 미디어 파일을 관리합니다.
    -   `id`: 기본 키
    -   `event_id`: 관련 이벤트의 외래 키
    -   `file_type`: 파일 종류 ('video_rgb', 'thumbnail' 등)
    -   `file_path`: 저장된 파일의 경로

ERD(Entity-Relationship Diagram)는 `backend/ERD.jpg` 파일에 시각적으로 정의되어 있습니다.

## 3. 서버 구현 내용

백엔드 서버는 Flask를 기반으로 모듈화된 구조로 설계되었습니다.

-   **API 엔드포인트 (`/app/api/routes.py`)**:
    -   JWT(JSON Web Token)를 이용한 인증을 적용하며, 특정 API는 관리자(`admin`) 권한을 요구합니다.
    -   `/api/events`: 최근 탐지 이벤트 목록 조회
    -   `/api/users`: 사용자 관리(조회, 추가, 삭제) (관리자 전용)
    -   `/api/cameras`: 카메라 관리(조회, 추가, 삭제) (관리자 전용)
    -   `/api/test_videos`: 테스트용 비디오 파일 목록 제공
    -   `/api/models`: 사용 가능한 AI 모델(`.pt` 파일) 목록 제공
-   **실시간 소켓 통신 (`/app/sockets/events.py`)**:
    -   `connect`, `disconnect`: 클라이언트 연결 및 해제 처리
    -   `start_stream`, `stop_stream`: 실시간 카메라 스트리밍 시작 및 중지
    -   `start_test_stream`, `stop_test_stream`: 저장된 테스트 영상을 이용한 분석 시작 및 중지
    -   `video_frame` (emit): 분석된 영상 프레임(RGB, TIR)을 클라이언트로 전송
    -   `new_event` (emit): 새로운 객체 탐지 이벤트를 클라이언트로 전송
-   **핵심 서비스 로직 (`/app/services/video_service.py`)**:
    -   **AI 모델 연동**: `ultralytics` 라이브러리를 통해 YOLO 모델을 로드하고, 입력된 영상 프레임에서 객체 탐지를 수행합니다. `custom_classes.py`에 정의된 커스텀 레이어를 모델에 등록하여 다중 스펙트럼 모델을 지원합니다.
    -   **다중 스펙트럼 처리**: RGB와 TIR 영상 프레임을 받아 AI 모델의 입력 형식에 맞게 전처리하고, 두 영상을 결합(fusion)하여 분석 정확도를 높입니다.
    -   **이벤트 기반 영상 녹화**: 객체 탐지 이벤트가 발생하면, 이벤트 발생 시점 이전 10초와 이후 10초, 총 20초 분량의 영상을 `event_recordings` 폴더에 자동으로 저장합니다. 웹 브라우저 호환성을 위해 H.264(MP4) 코덱을 우선적으로 사용합니다.
    -   **실시간 프레임 처리**: `cv2.imencode`를 통해 처리된 프레임을 JPG 형식으로 인코딩하고, Base64로 변환하여 Socket.IO를 통해 프론트엔드로 전송합니다.

## 4. 사용자 대시보드 및 통합 기능

프론트엔드는 `create-react-app`으로 구성된 SPA(Single Page Application)이며, 다음과 같은 주요 컴포넌트와 페이지로 사용자 경험을 제공합니다.

-   **주요 페이지 (`/src/pages`)**:
    -   `LoginPage.js`: 시스템 접근을 위한 로그인 페이지.
    -   `MainPage.js`: 핵심 대시보드 페이지로, 여러 컴포넌트를 조합하여 정보를 시각화합니다.
    -   `AdminPage.js`: 사용자 및 카메라 관리를 위한 관리자 전용 페이지.
-   **핵심 컴포넌트 (`/src/components`)**:
    -   `VideoStream.js`: 백엔드로부터 받은 실시간 영상 프레임(RGB, TIR)을 화면에 렌더링합니다.
    -   `EventList.js`: 새로운 탐지 이벤트가 발생할 때마다 목록을 갱신하여 보여줍니다.
    -   `EventDetailViewer.js`: 특정 이벤트를 클릭했을 때 녹화된 영상을 재생하고 상세 정보를 보여줍니다.
    -   `Dashboard.js`: 전체 시스템 현황을 종합적으로 보여주는 메인 컴포넌트입니다.
    -   `AdminPanel.js`: 관리자 페이지의 UI를 구성합니다.
    -   `TestModePanel.js`: 테스트 모드에서 사용할 영상 및 모델을 선택하고 제어하는 UI를 제공합니다.
-   **서비스 및 상태 관리**:
    -   **API 연동 (`/src/services/api.js`)**: `axios` 라이브러리를 사용하여 백엔드의 REST API와 통신합니다.
    -   **소켓 통신 (`/src/services/socket.js`)**: `socket.io-client`를 통해 백엔드 소켓 서버에 연결하고, 실시간 데이터(영상, 이벤트)를 수신합니다.
    -   **인증 관리 (`/src/context/AuthContext.js`)**: React Context API를 사용하여 사용자 로그인 상태 및 인증 정보를 전역적으로 관리합니다. `ProtectedRoute`와 `AdminRoute`를 통해 페이지 접근 권한을 제어합니다.
