@echo off
echo.
echo ?? SERC Setup Wizard
echo.
python --version
if errorlevel 1 (
    echo Python not found. Install from python.org
    pause
    exit /b 1
)
echo.
echo Installing dependencies...
pip install flask flask-cors pyserial opencv-python torch
echo.
set /p port="Enter ESP32 COM port (default COM3): "
if "%port%"=="" set port=COM3
echo Setting port to %port%
pause
