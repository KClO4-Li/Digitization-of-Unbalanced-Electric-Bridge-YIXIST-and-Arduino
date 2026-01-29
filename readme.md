### 非平衡电桥的数字化-物理创新能力提升实验II

岩板特有的大二实验课

包含: YIXIST VOLTAGE SENSOR(易玺电压传感器)的控制,arduino实现的桥臂电阻箱,Flask界面

hide_run.vbs和stop.bat分别是用来运行和停止整个程序的. hide_run.vbs中包含两个命令, 一是运行Flask(记得改为你的路径), 二是建立云端隧道(记得改为你的服务器域名). stop_bat即结束这两个进程.

ble_worker.py含有YIXIST电压传感器的基本操作, 基本上厂家也不会给你, 网上也比较难找, 这是我从源码中提取的, 可以通过python的bleak控制.

arduino_manager.py是一个粗糙的二进制电阻箱的实现, 用了三个8路继电器和步进50的二进制电阻. 使用的是StandardFirmata, 要使用python控制, 需要在arduino的客户端中找到Files->examples->Firmata->standardfirmata并将打开的程序upload至所控制的单片机上.

要用的话记得改一下开头的默认的配置参数, 包括YIXIST的蓝牙MAC和uuid(不知道的话用dnSpy的项目解析一下再把核心的.cs扔给ai分析一下就出来了, ZJLab\Devices\ComBLE.cs和VoltSensor.cs), Arduino的端口. 我的程序里面写的是从环境变量读取数据, 需要准备好.env文件, 在.env.example里面有一个我自己的示例.
