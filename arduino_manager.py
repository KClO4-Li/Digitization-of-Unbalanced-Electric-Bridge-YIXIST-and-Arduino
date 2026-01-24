from pyfirmata2 import Arduino, util
from dotenv import load_dotenv
import os
load_dotenv()

# 配置
ARDUINO_PORT = os.getenv("ARDUINO_PORT", "COM3")
RESISTOR_PINS_MAP = {2: 50, 3: 100, 4: 200, 5: 400, 6: 800}
MAX_RESISTANCE = sum(RESISTOR_PINS_MAP.values())

class ArduinoManager:
    def __init__(self):
        self.board = None
        self.pin_states = {i: False for i in RESISTOR_PINS_MAP.keys()}
        self.connected = False
        self.error_msg = "等待连接"

    def connect(self):
        try:
            #如果之前有连接，先尝试退出，释放串口资源 
            if self.board:
                try:
                    self.board.exit()
                except:
                    pass
            
            self.board = Arduino(ARDUINO_PORT)
            self.it = util.Iterator(self.board)
            self.it.start()
            self.connected = True
            self.error_msg = ""
            return True
        except Exception as e:
            self.connected = False
            self.board = None
            self.error_msg = str(e)
            return False

    def toggle_pin(self, pin, state):
        if not self.board or not self.connected: return False
        try:
            val = 1 if state else 0
            self.board.digital[pin].write(val)
            self.pin_states[pin] = state
            return True
        except: 
            self.connected = False # 写入失败通常意味着物理断开
            return False
    
    def set_resistance(self, target_val):
        if not self.board or not self.connected: return False, "未连接"
        if target_val % 50 != 0 or target_val > MAX_RESISTANCE: 
            return False, "阻值无效"
        
        units = target_val // 50
        for pin in RESISTOR_PINS_MAP.keys():
            self.toggle_pin(pin, bool((units >> (pin - 2)) & 1))
        return True, "OK"