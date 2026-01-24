// 全局状态变量
let latestVoltage = 0.0;
let currentResistance = 0;
let startTime = Date.now();
let chartInstance = null;
let autoRecordTimer = null;
const PIN_WEIGHTS = { 2: 50, 3: 100, 4: 200, 5: 400, 6: 800 };

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('btn-conn-arduino').onclick = connectArduino;
    document.getElementById('btn-conn-ble').onclick = connectBLE;

    document.getElementById('btn-start').onclick = () => { sendBleCmd('START'); setBleState(true); };
    document.getElementById('btn-stop').onclick = () => { sendBleCmd('STOP'); setBleState(false); };
    document.getElementById('btn-tare').onclick = () => sendBleCmd('TARE');
    document.getElementById('btn-set-res').onclick = setResistance;

    document.querySelectorAll('.pin-toggle').forEach(el => {
        el.onchange = () => togglePin(el.dataset.pin, el.checked);
    });

    initDefaultHeaders();
    updateChartOptions();
    setInterval(updateStatus, 500);
});

// --- 连接函数 ---

function connectArduino() {
    const btn = document.getElementById('btn-conn-arduino');
    // 设置中间状态，避免轮询立即重置
    btn.innerText = "正在尝试连接...";
    btn.disabled = true;

    fetch('api/arduino/connect', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
            if (d.status === 'error') {
                alert("Arduino连接失败: " + d.msg);
                resetArduinoBtnUI(); // 显式重置UI
            }
        }).catch(() => {
            alert("请求超时或网络错误");
            resetArduinoBtnUI();
        });
}

function connectBLE() {
    const btn = document.getElementById('btn-conn-ble');
    btn.innerText = "正在启动蓝牙扫描...";
    btn.disabled = true;
    fetch('api/ble/connect', { method: 'POST' })
        .catch(() => { resetBleBtnUI(); });
}

// --- UI 重置辅助函数 ---

function resetArduinoBtnUI() {
    const btn = document.getElementById('btn-conn-arduino');
    btn.className = "btn btn-outline-primary w-100 py-2 fw-bold";
    btn.innerText = "1. 连接电阻箱 (Arduino)";
    btn.disabled = false;
    document.getElementById('arduino-status').innerText = "未连接/已断开";
    document.getElementById('arduino-status').className = "alert alert-secondary py-1 text-center small";
    document.getElementById('res-input').disabled = true;
    document.getElementById('btn-set-res').disabled = true;
    document.querySelectorAll('.pin-toggle').forEach(p => p.disabled = true);
}

function resetBleBtnUI() {
    const btn = document.getElementById('btn-conn-ble');
    btn.className = "btn btn-outline-success w-100 py-2 fw-bold";
    btn.innerText = "2. 连接电压表 (蓝牙)";
    btn.disabled = false;
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('btn-tare').disabled = true;
}

// --- 状态轮询逻辑 (关键修改) ---

function updateStatus() {
    fetch('api/status').then(r => r.json()).then(data => {
        // 1. 处理 Arduino 状态
        const ardBtn = document.getElementById('btn-conn-arduino');
        if (data.arduino.connected) {
            // 已连接：变绿，但允许点击（以便用户想强制重连）
            if (ardBtn.innerText !== "电阻箱已连接 (点击可重连)") {
                ardBtn.className = "btn btn-success w-100 py-2 fw-bold";
                ardBtn.innerText = "电阻箱已连接 (点击可重连)";
                ardBtn.disabled = false;
            }

            document.getElementById('arduino-status').innerText = "在线";
            document.getElementById('arduino-status').className = "alert alert-success py-1 text-center small";
            document.getElementById('res-input').disabled = false;
            document.getElementById('btn-set-res').disabled = false;
            document.querySelectorAll('.pin-toggle').forEach(p => p.disabled = false);

            let totalR = 0;
            for (const [pin, state] of Object.entries(data.arduino.pins)) {
                const el = document.getElementById('pin-' + pin);
                if (el) el.checked = state;
                if (state) totalR += (PIN_WEIGHTS[pin] || 0);
            }
            currentResistance = totalR;
            document.getElementById('res-display').innerText = totalR + " Ω";
        } else {
            // 未连接：如果按钮当前不是“正在连接...”状态，则重置为初始状态
            // 这样如果是中途断开，按钮会自动变回蓝色，允许再次点击
            if (ardBtn.innerText !== "正在尝试连接...") {
                resetArduinoBtnUI();
            }
        }

        // 2. 处理 BLE 状态
        const bleBtn = document.getElementById('btn-conn-ble');
        document.getElementById('ble-status').innerText = data.ble.status;

        if (data.ble.connected) {
            if (bleBtn.innerText !== "电压表已连接 (点击可重连)") {
                bleBtn.className = "btn btn-success w-100 py-2 fw-bold";
                bleBtn.innerText = "电压表已连接 (点击可重连)";
                bleBtn.disabled = false;
            }

            latestVoltage = data.ble.voltage;
            document.getElementById('voltage-display').innerText = formatVoltage(latestVoltage);

            document.getElementById('btn-tare').disabled = false;
            // 只有在未测量时才允许按开始
            if (!data.ble.is_measuring) {
                document.getElementById('btn-start').disabled = false;
                document.getElementById('btn-stop').disabled = true;
            } else {
                document.getElementById('btn-start').disabled = true;
                document.getElementById('btn-stop').disabled = false;
            }
        } else {
            if (bleBtn.innerText !== "正在启动蓝牙扫描...") {
                resetBleBtnUI();
            }
            document.getElementById('voltage-display').innerText = "---- V";
        }
    }).catch(err => {
        console.error("轮询失败:", err);
    });
}

// --- 辅助逻辑 (API调用等) ---
function sendBleCmd(cmd, val = null) {
    fetch('api/ble/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, val })
    });
}
function setResistance() {
    const input = document.getElementById('res-input');
    const val = parseInt(input.value);
    if (!input.value || isNaN(val)) return alert("请输入数值");
    fetch('api/arduino/set_resistance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ val })
    }).then(r => r.json()).then(d => { if (d.status === 'error') alert(d.msg); });
}
function togglePin(pin, state) {
    fetch('api/arduino/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: parseInt(pin), state })
    });
}
function formatVoltage(v) {
    if (v === null || v === undefined) return "0.0000 V";
    return Math.abs(v) < 1.0 ? (v * 1000).toFixed(2) + " mV" : v.toFixed(4) + " V";
}
function setBleState(measuring) {
    document.getElementById('btn-start').disabled = measuring;
    document.getElementById('btn-stop').disabled = !measuring;
    document.getElementById('btn-tare').disabled = false;
    document.getElementById('ble-freq').disabled = measuring;
    document.getElementById('ble-range').disabled = measuring;
}

// --- 表格与动态列逻辑 ---

function initDefaultHeaders() {
    const tr = document.getElementById('table-header-row');
    tr.innerHTML = '';
    createHeaderCell(tr, 'time', '时间 (s)');
    createHeaderCell(tr, 'voltage', '电压 (V)');
    createHeaderCell(tr, 'resistance', 'R0 (Ω)');
    createHeaderCell(tr, 'calc_linear', 'ΔR(近似)');
    createHeaderCell(tr, 'custom', '备注');
    const opTh = document.createElement('th');
    opTh.innerText = "操作"; opTh.style.width = "50px";
    tr.appendChild(opTh);
}

function createHeaderCell(row, defaultType = 'custom', defaultLabel = '') {
    const th = document.createElement('th');
    th.style.minWidth = "120px";
    th.innerHTML = getHeaderContentHTML(defaultType, defaultLabel);
    const lastTh = row.lastElementChild;
    if (lastTh && lastTh.innerText === "操作") { row.insertBefore(th, lastTh); }
    else { row.appendChild(th); }
}

function getHeaderContentHTML(typeValue, labelValue) {
    return `
    <div class="th-container">
        <button class="btn btn-danger btn-del-col" onclick="deleteColumn(this)">×</button>
        <select class="form-select form-select-sm table-header-select" onchange="onHeaderTypeChange(this)">
            <option value="time" ${typeValue === 'time' ? 'selected' : ''}>时间</option>
            <option value="voltage" ${typeValue === 'voltage' ? 'selected' : ''}>电压 (Ug)</option>
            <option value="resistance" ${typeValue === 'resistance' ? 'selected' : ''}>桥臂电阻 (R0)</option>
            <option value="calc_strict" ${typeValue === 'calc_strict' ? 'selected' : ''}>ΔR (精确公式)</option>
            <option value="calc_linear" ${typeValue === 'calc_linear' ? 'selected' : ''}>ΔR (近似公式)</option>
            <option value="custom" ${typeValue === 'custom' ? 'selected' : ''}>自定义/其它</option>
        </select>
        <input type="text" class="form-control form-control-sm table-header-label" 
               placeholder="列名称" value="${labelValue}">
    </div>`;
}

function onHeaderTypeChange(selectEl) {
    const inputEl = selectEl.parentElement.querySelector('.table-header-label');
    const map = { 'time': '时间 (s)', 'voltage': '电压 (V)', 'resistance': 'R0 (Ω)', 'calc_strict': 'ΔR (精确)', 'calc_linear': 'ΔR (近似)', 'custom': '' };
    if (map[selectEl.value] !== undefined) inputEl.value = map[selectEl.value];
    updateChartOptions();
}

function addColumn() {
    const headerRow = document.getElementById('table-header-row');
    createHeaderCell(headerRow, 'custom', '自定义');
    const rows = document.querySelectorAll('#table-body tr');
    rows.forEach(row => {
        const lastTd = row.lastElementChild;
        const newTd = document.createElement('td'); newTd.contentEditable = true;
        row.insertBefore(newTd, lastTd);
    });
    updateChartOptions();
}

function deleteColumn(btn) {
    if (!confirm("确定删除此列及所有数据吗？")) return;
    const th = btn.closest('th');
    const headerRow = th.parentElement;
    const colIndex = Array.from(headerRow.children).indexOf(th);
    th.remove();
    document.querySelectorAll('#table-body tr').forEach(row => {
        if (row.children[colIndex]) row.children[colIndex].remove();
    });
    updateChartOptions();
}

function recordManualPoint() {
    const tbody = document.getElementById('table-body');
    const row = document.createElement('tr');
    const headerSelects = document.querySelectorAll('.table-header-select');
    let Us = parseFloat(document.getElementById('us-input').value);
    if (isNaN(Us) || Us <= 0) Us = 2.0;
    const Ug = latestVoltage || 0.0;
    const R0 = currentResistance || 0;

    headerSelects.forEach(select => {
        const type = select.value;
        const td = document.createElement('td'); td.contentEditable = true;
        if (type === 'time') td.innerText = ((Date.now() - startTime) / 1000).toFixed(2);
        else if (type === 'voltage') td.innerText = formatVoltage(Ug).replace(' ', '');
        else if (type === 'resistance') td.innerText = R0;
        else if (type === 'calc_linear') td.innerText = (4 * R0 * Ug / Us).toFixed(4);
        else if (type === 'calc_strict') {
            const denom = Us - 2 * Ug;
            td.innerText = (Math.abs(denom) < 0.0001) ? "Err" : (4 * Ug * R0 / denom).toFixed(4);
        } else td.innerText = "";
        row.appendChild(td);
    });
    const delTd = document.createElement('td');
    delTd.innerHTML = '<button class="btn btn-sm btn-link text-danger p-0" onclick="this.closest(\'tr\').remove()">×</button>';
    row.appendChild(delTd);
    tbody.appendChild(row);
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addEmptyRow() {
    const tbody = document.getElementById('table-body');
    const row = document.createElement('tr');
    const colCount = document.querySelectorAll('.table-header-select').length;
    for (let i = 0; i < colCount; i++) {
        const td = document.createElement('td'); td.contentEditable = true;
        row.appendChild(td);
    }
    const delTd = document.createElement('td');
    delTd.innerHTML = '<button class="btn btn-sm btn-link text-danger p-0" onclick="this.closest(\'tr\').remove()">×</button>';
    row.appendChild(delTd);
    tbody.appendChild(row);
}

function clearTable() {
    if (confirm("确定清空数据？")) {
        document.getElementById('table-body').innerHTML = "";
        startTime = Date.now();
        if (chartInstance) chartInstance.destroy();
    }
}

function startAutoRecord() {
    const intervalInput = document.getElementById('auto-rec-interval');
    let interval = parseFloat(intervalInput.value);
    if (isNaN(interval) || interval < 0.1) return alert("间隔时间必须 >= 0.1 秒");
    document.getElementById('btn-auto-rec-start').disabled = true;
    document.getElementById('btn-auto-rec-stop').disabled = false;
    intervalInput.disabled = true;
    document.getElementById('btn-auto-rec-start').innerHTML = '<span class="spinner-grow spinner-grow-sm"></span> 记录中...';
    recordManualPoint();
    autoRecordTimer = setInterval(() => { recordManualPoint(); }, interval * 1000);
}

function stopAutoRecord() {
    if (autoRecordTimer) { clearInterval(autoRecordTimer); autoRecordTimer = null; }
    document.getElementById('btn-auto-rec-start').disabled = false;
    document.getElementById('btn-auto-rec-stop').disabled = true;
    document.getElementById('auto-rec-interval').disabled = false;
    document.getElementById('btn-auto-rec-start').innerText = "▶ 启动自动";
}

function exportToCSV() {
    let csv = "\uFEFF";
    const headerInputs = document.querySelectorAll('.table-header-label');
    csv += Array.from(headerInputs).map(input => input.value).join(",") + "\n";
    document.querySelectorAll('#table-body tr').forEach(row => {
        const dataCells = Array.from(row.querySelectorAll('td')).slice(0, -1);
        csv += dataCells.map(td => td.innerText).join(",") + "\n";
    });
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = `实验数据_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function updateChartOptions() {
    const xSelect = document.getElementById('chart-x-col');
    const ySelect = document.getElementById('chart-y-col');
    const headerInputs = document.querySelectorAll('.table-header-label');
    const oldX = xSelect.value; const oldY = ySelect.value;
    xSelect.innerHTML = ''; ySelect.innerHTML = '';
    headerInputs.forEach((input, index) => {
        const name = input.value || `第${index + 1}列`;
        xSelect.add(new Option(name, index)); ySelect.add(new Option(name, index));
    });
    if (headerInputs.length > 1 && !oldY) ySelect.value = 1;
    if (oldX && oldX < headerInputs.length) xSelect.value = oldX;
    if (oldY && oldY < headerInputs.length) ySelect.value = oldY;
}

function drawChart() {
    const xColIdx = parseInt(document.getElementById('chart-x-col').value);
    const yColIdx = parseInt(document.getElementById('chart-y-col').value);
    const headerInputs = document.querySelectorAll('.table-header-label');
    const xLabel = headerInputs[xColIdx] ? headerInputs[xColIdx].value : "X";
    const yLabel = headerInputs[yColIdx] ? headerInputs[yColIdx].value : "Y";
    const dataPoints = [];
    document.querySelectorAll('#table-body tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length <= Math.max(xColIdx, yColIdx)) return;
        let xVal = parseFloat(cells[xColIdx].innerText);
        let yVal = parseFloat(cells[yColIdx].innerText);
        if (!isNaN(xVal) && !isNaN(yVal)) dataPoints.push({ x: xVal, y: yVal });
    });
    if (dataPoints.length === 0) return alert("表格为空或无法解析数值");
    const ctx = document.getElementById('experimentChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: `${yLabel} vs ${xLabel}`,
                data: dataPoints,
                backgroundColor: 'rgba(54, 162, 235, 1)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', position: 'bottom', title: { display: true, text: xLabel } },
                y: { title: { display: true, text: yLabel } }
            }
        }
    });
}