# Algorithm Platform

Платформа для работы с алгоритмами: **Django REST API** (бэкенд), **React + Vite** (веб) и **PyQt5** (десктоп). Десктоп и веб обращаются к API на `http://localhost:8000/api`.

---

## Содержание

- [Что понадобится](#что-понадобится)
- [Установка Node.js и npm](#установка-nodejs-и-npm)
- [Зависимости Python](#зависимости-python)
- [Запуск бэкенда](#запуск-бэкенда)
- [Запуск веб-интерфейса (Vite)](#запуск-веб-интерфейса-vite)
- [Запуск десктоп-приложения](#запуск-десктоп-приложения)
- [Порты и порядок запуска](#порты-и-порядок-запуска)

---

## Что понадобится

| Компонент | Назначение |
|-----------|------------|
| **Python 3.9+** | бэкенд Django и десктоп PyQt5 |
| **Node.js 18+** (вместе с **npm**) | фронтенд; **Vite** ставится локально в проект через `npm install` |

Клонирование репозитория (одинаково на всех ОС):

```bash
git clone https://github.com/DZaytsev4/algorithm_platform_full.git
cd algorithm_platform_full
```

---

## Установка Node.js и npm

**Vite** указан в `frontend/package.json` как dev-зависимость — отдельно ставить Vite глобально не обязательно: после `npm install` в папке `frontend` будет использоваться локальный `vite`.

### Linux (Ubuntu / Debian)

Установка через пакетный менеджер или с [nodejs.org](https://nodejs.org/):

```bash
sudo apt update
sudo apt install -y nodejs npm
```

Проверка:

```bash
node -v
npm -v
```

### Windows

1. Скачайте установщик **LTS** с [https://nodejs.org/](https://nodejs.org/) и установите (в комплекте идёт **npm**).
2. Откройте **PowerShell** или **cmd** и проверьте:

```powershell
node -v
npm -v
```

---

## Зависимости Python

Файл **`requirements.txt`** лежит в **корне** репозитория (не в `backend/`). Рекомендуется виртуальное окружение в корне проекта.

### Linux

```bash
cd algorithm_platform_full
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Windows (PowerShell)

```powershell
cd algorithm_platform_full
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Если в PowerShell ругается на политику выполнения скриптов, один раз для текущего пользователя:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Windows (cmd)

```cmd
cd algorithm_platform_full
python -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> **Десктоп (PyQt5):** если после `pip install` при запуске десктопа не хватает системных библиотек Qt, на Ubuntu попробуйте: `sudo apt install python3-pyqt5` — либо убедитесь, что используете то же venv, куда ставили зависимости из `requirements.txt`.

---

## Запуск бэкенда

База по умолчанию — **SQLite** (`backend/db.sqlite3`). Активируйте то же venv, что и для зависимостей.

### Linux

```bash
cd algorithm_platform_full
source .venv/bin/activate
cd backend
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
```

Опционально — админка Django:

```bash
python manage.py createsuperuser
```

### Windows (PowerShell)

```powershell
cd algorithm_platform_full
.\.venv\Scripts\Activate.ps1
cd backend
python manage.py makemigrations
python manage.py migrate
python manage.py runserver
```

```powershell
python manage.py createsuperuser
```

API будет доступен по адресу **http://127.0.0.1:8000/api** (корень сайта — **http://127.0.0.1:8000/**).

---

## Запуск веб-интерфейса (Vite)

Фронтенд — папка **`frontend`**. Здесь же через **`npm install`** подтягиваются React, **Vite** (`devDependencies`) и остальные пакеты.

### Linux

```bash
cd algorithm_platform_full/frontend
npm install
npm run dev
```

### Windows

```powershell
cd algorithm_platform_full\frontend
npm install
npm run dev
```

После старта откройте в браузере адрес, который покажет Vite (по настройкам проекта — **http://localhost:3000**).

Сборка продакшена:

```bash
npm run build
```

Просмотр собранного варианта:

```bash
npm run preview
```

---

## Запуск десктоп-приложения

Десктоп ожидает бэкенд на **http://localhost:8000** (см. `algorithm_desktop/config.py`, поле `BASE_URL`). Сначала запустите **Django**, затем клиент.

### Linux

```bash
cd algorithm_platform_full
source .venv/bin/activate
cd algorithm_desktop
python main.py
```

### Windows

```powershell
cd algorithm_platform_full
.\.venv\Scripts\Activate.ps1
cd algorithm_desktop
python main.py
```

---

## Порты и порядок запуска

| Сервис | URL / порт |
|--------|------------|
| Бэкенд Django | http://127.0.0.1:8000 |
| Веб (Vite) | http://localhost:3000 |
| Десктоп | подключается к API на порту **8000** |

**Рекомендуемый порядок:**

1. Включить виртуальное окружение и запустить **`python manage.py runserver`** из `backend`.
2. В отдельном терминале: в `frontend` выполнить **`npm install`** (один раз), затем **`npm run dev`**.
3. Для десктопа: при работающем бэкенде запустить **`python main.py`** из `algorithm_desktop`.

---

## Краткая шпаргалка команд

| Задача | Команда (из корня репозитория после активации venv) |
|--------|-----------------------------------------------------|
| Установить Python-зависимости | `pip install -r requirements.txt` |
| Миграции и сервер | `cd backend` → `python manage.py migrate` → `python manage.py runserver` |
| Установить npm-зависимости и Vite (локально) | `cd frontend` → `npm install` |
| Дев-сервер фронта | `cd frontend` → `npm run dev` |
| Десктоп | `cd algorithm_desktop` → `python main.py` |

Во всех блоках выше используются стандартные для GitHub **многострочные блоки кода** — в интерфейсе GitHub у блока есть кнопка копирования.
