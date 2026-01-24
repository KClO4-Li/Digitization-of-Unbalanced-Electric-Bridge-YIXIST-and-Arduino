import asyncio
import threading
import struct
from bleak import BleakClient
from dotenv import load_dotenv
import os
load_dotenv()

# 配置
SENSOR_MAC = os.getenv("SENSOR_MAC", "00:00:00:00:00:00")
UART_NOTIFY_UUID = os.getenv("UART_NOTIFY_UUID", "49535343-1e4d-4bd9-ba61-23c647249616")
UART_WRITE_UUID  = os.getenv("UART_WRITE_UUID", "49535343-1e4d-4bd9-ba61-23c647249616")

class BleWorker:
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self.client = None
        self.running = False
        self.connected = False
        self.is_measuring = False 
        
        self.voltage = 0.0
        self.tare_offset = 0.0
        self.target_range_idx = 0 
        
        self.calibration = {0: None, 1: None}
        self.command_queue = asyncio.Queue()
        self.status_msg = "等待连接..."
        self.calib_event = asyncio.Event()

    def start_thread(self):
        if not self.running:
            t = threading.Thread(target=self._run_loop, daemon=True)
            t.start()
            return True
        return False

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._main_task())

    def send_command_sync(self, cmd, val=None):
        if self.loop.is_running():
            self.loop.call_soon_threadsafe(self.command_queue.put_nowait, (cmd, val))

    async def _main_task(self):
        self.running = True
        self.status_msg = f"正在连接 {SENSOR_MAC}..."
        try:
            async with BleakClient(SENSOR_MAC, timeout=10.0) as client:
                self.client = client
                self.connected = True
                self.status_msg = "已连接 | 正在获取参数..."
                
                await client.start_notify(UART_NOTIFY_UUID, self._notification_handler)
                await asyncio.sleep(1.0) 

                await self._force_fetch_calibration(0)
                await self._force_fetch_calibration(1)
                
                self.status_msg = "就绪"
                await self._handle_command('SET_RANGE', 0)

                while self.running and client.is_connected:
                    if not self.command_queue.empty():
                        cmd, val = await self.command_queue.get()
                        await self._handle_command(cmd, val)
                    await asyncio.sleep(0.05)
                    
        except Exception as e:
            self.status_msg = f"错误: {str(e)[:15]}"
            print(f"BLE Error: {e}")
        finally:
            self.connected = False
            self.running = False
            if "错误" not in self.status_msg:
                self.status_msg = "连接已断开"

    async def _force_fetch_calibration(self, range_idx):
        for i in range(3): 
            self.calib_event.clear()
            await self._send_cmd(0x35, [range_idx])
            try:
                await asyncio.wait_for(self.calib_event.wait(), timeout=1.5)
                calib = self.calibration.get(range_idx)
                if calib and calib['slope'] != 1.0: return True
            except asyncio.TimeoutError: pass
        return False

    async def _handle_command(self, cmd_type, val):
        if cmd_type == 'START':
            self.is_measuring = True
            await self._send_cmd(0x37, [0x01, 0x01])
            self.status_msg = "测量中"
        elif cmd_type == 'TARE':
            self.tare_offset = self.voltage + self.tare_offset
        elif cmd_type == 'STOP':
            self.is_measuring = False
            self.status_msg = "已停止"
        elif cmd_type == 'SET_FREQ':
            period_us = int(2000000 / val)
            await self._send_cmd(0x31, list(period_us.to_bytes(4, 'little')))
        elif cmd_type == 'SET_RANGE':
            self.target_range_idx = val
            await self._send_cmd(0x32, [val])
            await self._send_cmd(0x35, [val])

    def _notification_handler(self, sender, data):
        if len(data) < 9 or data[0] != 0xAA: return
        cmd = data[4]
        payload = data[5:-3]
        
        if cmd == 0x35 and len(payload) >= 9:
            range_id = payload[0]
            slope = struct.unpack('<f', payload[1:5])[0]
            intercept = struct.unpack('<f', payload[5:9])[0]
            if abs(slope) < 100 and slope != 0: 
                self.calibration[range_id] = {"slope": slope, "intercept": intercept}
                self.calib_event.set()
        elif cmd == 0x37 and len(payload) >= 10:
            if not self.is_measuring: return
            packet_range_idx = payload[0]
            calib = self.calibration.get(packet_range_idx)
            if calib:
                ad_value = payload[8] | (payload[9] << 8)
                self.voltage = ((ad_value * calib["slope"]) + calib["intercept"]) - self.tare_offset

    async def _send_cmd(self, cmd, payload):
        HEADER, ENDER = 0xAA, 0x7E
        total_len = len(payload) + 8
        pkt = bytearray([HEADER, 0x00, (total_len >> 8) & 0xFF, total_len & 0xFF, cmd])
        pkt.extend(payload)
        crc = 0xFFFF
        for b in pkt:
            crc ^= b
            for _ in range(8):
                if crc & 1: crc = (crc >> 1) ^ 0xA001
                else: crc >>= 1
        pkt.extend([crc & 0xFF, (crc >> 8) & 0xFF, ENDER])
        if self.client and self.client.is_connected:
            await self.client.write_gatt_char(UART_WRITE_UUID, pkt)