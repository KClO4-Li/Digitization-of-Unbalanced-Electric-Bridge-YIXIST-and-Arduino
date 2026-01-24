from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from arduino_manager import ArduinoManager, ARDUINO_PORT
from ble_worker import BleWorker

app = Flask(__name__)
CORS(app) # 解决跨域问题

# 初始化模块实例
ble_worker = BleWorker()
arduino_mgr = ArduinoManager()

@app.route('/')
def index():
    return render_template('index.html')

# --- Arduino 路由 ---
@app.route('/api/arduino/connect', methods=['POST'])
def connect_arduino():
    success = arduino_mgr.connect()
    return jsonify({"status": "ok" if success else "error", "msg": arduino_mgr.error_msg})

@app.route('/api/arduino/control', methods=['POST'])
def control_arduino():
    data = request.json
    arduino_mgr.toggle_pin(data.get('pin'), data.get('state'))
    return jsonify({"status": "ok"})

@app.route('/api/arduino/set_resistance', methods=['POST'])
def set_resistance():
    val = int(request.json.get('val', 0))
    success, msg = arduino_mgr.set_resistance(val)
    return jsonify({"status": "ok" if success else "error", "msg": msg})

# --- BLE 路由 ---
@app.route('/api/ble/connect', methods=['POST'])
def connect_ble():
    success = ble_worker.start_thread()
    return jsonify({"status": "ok" if success else "error"})

@app.route('/api/ble/control', methods=['POST'])
def control_ble():
    data = request.json
    ble_worker.send_command_sync(data.get('cmd'), data.get('val'))
    return jsonify({"status": "ok"})

# --- 状态轮询 ---
@app.route('/api/status')
def get_status():
    return jsonify({
        "arduino": {
            "connected": arduino_mgr.connected, 
            "port": ARDUINO_PORT, 
            "error": arduino_mgr.error_msg, 
            "pins": arduino_mgr.pin_states
        },
        "ble": {
            "connected": ble_worker.connected, 
            "voltage": ble_worker.voltage, 
            "status": ble_worker.status_msg, 
            "range_idx": ble_worker.target_range_idx
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)