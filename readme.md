### 非平衡电桥的数字化-物理创新能力提升实验II

岩板特有的大二实验课

包含: YIXIST VOLTAGE SENSOR(易玺电压传感器)的控制,arduino实现的桥臂电阻箱,Flask界面

下面的hide_run.vbs和stop.bat分别是用来运行和停止整个程序的. hide_run.vbs还做了远程控制, 利用ssh的端口转发到云端的5005端口, 没有云端的话可以忽略, 直接运行.py即可. 我用的是azure的免费资源, 用的话记得配一下nginx.

ble_worker含有YIXIST电压传感器的基本操作, 基本上厂家不会给你, 网上也比较难找, 这是我用dnSpy解析软件弄出来的源码中提取的, 可以通过python的bleak控制.

arduino_manager是一个粗糙的二进制电阻箱的实现, 用了三个8路继电器和步进50的二进制电阻. 使用的是StandardFirmata, 记得提前烧录.

要用的话记得改一下开头的默认的配置参数, 包括YIXIST的蓝牙MAC和uuid(不知道的话用dnSpy的项目解析一下再把核心的.cs扔给ai分析一下就出来了), Arduino的端口.
