<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>AI Super Chat Pro</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        /* --- CẤU HÌNH GIAO DIỆN --- */
        :root { --primary-color: #0084ff; --bg-color: #f0f2f5; --danger-color: #ff3b30; --success-color: #28a745; --text-color: #333; }
        * { box-sizing: border-box; }
        
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-color); height: 100dvh; width: 100vw; display: flex; justify-content: center; overflow: hidden; }
        .app-container { width: 100%; max-width: 600px; height: 100%; background: white; display: flex; flex-direction: column; position: relative; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
        
        /* HEADER */
        .header { padding: 0 15px; background: rgba(255,255,255,0.95); border-bottom: 1px solid #e5e5ea; display: flex; align-items: center; justify-content: space-between; height: 60px; flex-shrink: 0; z-index: 10; }
        .header-title { font-weight: 600; font-size: 16px; color: var(--text-color); display: flex; align-items: center; gap: 8px; }
        .reset-btn { background: none; border: none; cursor: pointer; color: var(--danger-color); font-size: 16px; padding: 8px; transition: 0.2s; border-radius: 50%; }
        .reset-btn:hover { background: #ffe5e5; }

        /* TABS */
        .tabs { display: flex; background: white; border-bottom: 1px solid #e5e5ea; flex-shrink: 0; }
        .tab-btn { flex: 1; padding: 12px; border: none; background: none; font-weight: 600; color: #888; cursor: pointer; border-bottom: 2px solid transparent; transition: 0.3s; }
        .tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }

        /* CONTENT AREA */
        .content-area { flex: 1; position: relative; overflow: hidden; display: flex; flex-direction: column; }
        
        /* PANEL CHAT */
        #chatPanel { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
        
        /* --- PANEL MEMORY (ĐÃ SỬA CSS ĐỂ GIÃN KHUNG) --- */
        #memoryPanel { 
            height: 100%; 
            padding: 15px; 
            background: #fff; 
            display: none; /* JS sẽ đổi thành flex */
            flex-direction: column; /* Xếp dọc */
            overflow: hidden; /* Chặn cuộn ngoài */
        }

        /* SETTINGS UI */
        .settings-box { 
            background: #f8f9fa; 
            border: 1px solid #e9ecef; 
            padding: 15px; 
            border-radius: 8px; 
            margin-bottom: 15px;
            flex-shrink: 0; /* Không bị co lại */
        }
        .setting-row { margin-bottom: 15px; }
        .setting-label { display: block; font-weight: 600; font-size: 13px; color: #555; margin-bottom: 5px; }
        select.full-width { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; background: white; font-size: 14px; outline: none; }
        .limit-input-group { display: flex; align-items: center; gap: 10px; }
        .limit-input-group input { width: 100px; padding: 8px; border: 1px solid #ccc; border-radius: 6px; text-align: center; }
        .mem-status { font-size: 13px; color: #666; margin-top: 5px; display: flex; justify-content: space-between; }
        
        /* KHUNG HIỂN THỊ BỘ NHỚ (TO & CÓ SCROLL) */
        .memory-wrapper {
            flex: 1; /* Chiếm hết phần còn lại */
            display: flex; flex-direction: column;
            border: 1px solid #ddd; border-radius: 8px;
            overflow: hidden;
        }
        .memory-header-text {
            background: #eee; padding: 8px 12px; font-weight: bold; font-size: 13px; color: #555; border-bottom: 1px solid #ddd;
        }
        .memory-display { 
            flex: 1; /* Giãn hết cỡ */
            background: #1e1e1e; /* Màu nền tối dễ đọc */
            padding: 15px; 
            font-family: 'Consolas', monospace; font-size: 13px; line-height: 1.6; 
            white-space: pre-wrap; color: #0f0; /* Chữ xanh lá */
            overflow-y: auto; /* Thanh cuộn riêng cho bộ nhớ */
        }

        /* CHAT UI */
        .chat-list { flex: 1; padding: 15px; overflow-y: auto; background: var(--bg-color); display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth; }
        .message { max-width: 85%; padding: 10px 16px; border-radius: 18px; font-size: 16px; line-height: 1.5; word-wrap: break-word; }
        .user { align-self: flex-end; background: var(--primary-color); color: white; border-bottom-right-radius: 4px; }
        .ai { align-self: flex-start; background: white; border: 1px solid #e5e5ea; color: black; border-bottom-left-radius: 4px; }
        .system { align-self: center; font-size: 12px; color: #666; background: rgba(0,0,0,0.05); padding: 5px 12px; border-radius: 12px; margin: 5px 0; text-align: center; }
        
        /* REASONING STYLE */
        .reasoning-box { margin-bottom: 8px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fafafa; }
        .reasoning-header { background: #f0f0f0; padding: 6px 10px; font-size: 12px; font-weight: 600; color: #666; cursor: pointer; display: flex; align-items: center; gap: 5px; }
        .reasoning-content { padding: 10px; font-family: monospace; font-size: 13px; color: #444; border-top: 1px solid #ddd; background: white; white-space: pre-wrap; display: none; }
        .reasoning-box.open .reasoning-content { display: block; }
        .arrow { transition: transform 0.2s; font-size: 10px; }
        .reasoning-box.open .arrow { transform: rotate(180deg); }

        .typing { display: none; align-self: flex-start; background: white; padding: 10px 15px; border-radius: 18px; margin-bottom: 10px; width: fit-content; border: 1px solid #e5e5ea; }
        .dot { width: 6px; height: 6px; background: #888; border-radius: 50%; display: inline-block; animation: bounce 1.4s infinite; margin: 0 2px; }
        .dot:nth-child(2) { animation-delay: 0.2s; } .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

        /* INPUT AREA */
        .input-wrapper { background: white; border-top: 1px solid #c6c6c8; padding-bottom: env(safe-area-inset-bottom, 15px); flex-shrink: 0; }
        .normal-mode { padding: 10px 15px; display: flex; align-items: center; gap: 10px; }
        input.chat-input { flex: 1; padding: 12px 15px; border-radius: 20px; border: 1px solid #c6c6c8; font-size: 16px; outline: none; background: #f9f9f9; }
        input.chat-input:focus { border-color: var(--primary-color); background: white; }
        .action-btn { width: 40px; height: 40px; border-radius: 50%; border: none; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        #sendBtn { background: var(--primary-color); color: white; }
        #micBtn { background: #e4e6eb; color: #333; }
        #micBtn.active { background: var(--danger-color); color: white; animation: pulse 1.5s infinite; }

        .walkie-talkie-mode { display: none; justify-content: center; align-items: center; padding: 20px; flex-direction: column; gap: 10px; background: #f8f9fa; border-top: 1px solid #ddd; }
        .big-mic-btn { width: 80px; height: 80px; border-radius: 50%; border: none; background: var(--primary-color); color: white; font-size: 30px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: transform 0.1s, background 0.3s; display: flex; align-items: center; justify-content: center; }
        .big-mic-btn:active { transform: scale(0.9); background: var(--danger-color); }
        .big-mic-btn.recording { background: var(--danger-color); animation: pulse 1.5s infinite; }
        .wt-status { font-size: 14px; color: #666; font-weight: 500; }

        /* Toggle */
        .toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .switch { position: relative; display: inline-block; width: 34px; height: 20px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--primary-color); }
        input:checked + .slider:before { transform: translateX(14px); }

        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(255, 59, 48, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0); } }
    </style>
</head>
<body>

<div class="app-container">
    <div class="header">
        <div class="header-title"><i class="fas fa-brain" style="color: #0084ff;"></i> Super AI</div>
        <div class="header-right">
            <button id="wtToggleBtn" class="header-btn" onclick="toggleVoiceMode()" title="Chế độ Bộ đàm"><i class="fas fa-walkie-talkie"></i></button>
            <button class="header-btn" onclick="resetChat()" title="Xóa tất cả"><i class="fas fa-trash-alt"></i></button>
        </div>
    </div>

    <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('chat')" id="tabChat">💬 Chat</button>
        <button class="tab-btn" onclick="switchTab('memory')" id="tabMem">🧠 Bộ Nhớ</button>
    </div>

    <div class="content-area">
        <!-- TAB 1: CHAT -->
        <div id="chatPanel">
            <div class="chat-list" id="chatBox">
                <div class="message ai">Xin chào! Tôi có thể giúp gì cho bạn hôm nay?</div>
                <div class="typing" id="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
            </div>
            
            <div class="input-wrapper">
                <div class="normal-mode" id="normalInput">
                    <input type="text" id="userInput" class="chat-input" placeholder="Nhập tin nhắn..." autocomplete="off">
                    <button id="micBtn" class="action-btn" onclick="toggleNormalVoice()"><i class="fas fa-microphone"></i></button>
                    <button id="sendBtn" class="action-btn" onclick="sendMessage()"><i class="fas fa-paper-plane"></i></button>
                </div>
                <div class="walkie-talkie-mode" id="wtInput">
                    <div class="wt-status" id="wtStatus">Nhấn giữ để nói...</div>
                    <button id="bigMicBtn" class="big-mic-btn" onmousedown="startHold()" onmouseup="endHold()" ontouchstart="startHold()" ontouchend="endHold()"><i class="fas fa-microphone"></i></button>
                </div>
            </div>
        </div>

        <!-- TAB 2: SETTINGS & MEMORY -->
        <div id="memoryPanel">
            <div class="settings-box">
                <div class="toggle-row">
                    <label class="setting-label" style="margin:0; color:#000;">🔄 Auto Switch (Khi lỗi):</label>
                    <label class="switch"><input type="checkbox" id="autoSwitchToggle" checked><span class="slider"></span></label>
                </div>
                
                <div class="setting-row">
                    <label class="setting-label">🤖 Chọn Model:</label>
                    <select id="modelSelect" class="full-width">
                        <option value="llama-3.1-8b-instant" selected>Llama 3.1 8B (Nhanh - Ổn định)</option>
                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Thông minh)</option>
                        <option value="qwen/qwen3-32b">Qwen 3 32B (Có suy luận)</option>
                        <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout 17B (Mới)</option>
                        <option value="moonshotai/kimi-k2-instruct-0905">Moonshot Kimi k2 (0905)</option>
                        <option value="moonshotai/kimi-k2-instruct">Moonshot Kimi k2 (Gốc)</option>
                        <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
                        <option value="openai/gpt-oss-20b">GPT-OSS 20B</option>
                        <option value="openai/gpt-oss-safeguard-20b">GPT-OSS Safeguard 20B</option>
                    </select>
                </div>
                
                <!-- History Limit (MỚI) -->
                <div class="setting-row">
                    <label class="setting-label">📜 Lịch sử ngắn hạn (Tin nhắn):</label>
                    <div class="limit-input-group">
                        <input type="number" id="historyLimitInput" value="10" min="2" max="50">
                        <span>tin</span>
                    </div>
                </div>

                <div class="setting-row">
                    <label class="setting-label">🧠 Giới hạn Bộ nhớ (Ký tự):</label>
                    <div class="limit-input-group">
                        <input type="number" id="memLimitInput" value="2000" min="500" step="100">
                        <span>chars</span>
                    </div>
                </div>
            </div>

            <!-- KHUNG BỘ NHỚ TO ĐÙNG (FLEX 1) -->
            <div class="memory-wrapper">
                <div class="memory-header-text">
                    NỘI DUNG NÃO BỘ <span id="currLen" style="float:right; font-weight:normal; color:#666;">0 chars</span>
                </div>
                <div id="memoryDisplay" class="memory-display">Chưa có dữ liệu...</div>
            </div>
        </div>
    </div>
</div>

<script>
    const API_URL = "/api/chat";
    const chatBox = document.getElementById('chatBox');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const loading = document.getElementById('loading');
    
    // Settings Elements
    const memoryDisplay = document.getElementById('memoryDisplay');
    const currLen = document.getElementById('currLen');
    const memLimitInput = document.getElementById('memLimitInput');
    const historyLimitInput = document.getElementById('historyLimitInput');
    const modelSelect = document.getElementById('modelSelect');
    const autoSwitchToggle = document.getElementById('autoSwitchToggle');
    
    // Voice Elements
    const normalInput = document.getElementById('normalInput');
    const wtInput = document.getElementById('wtInput');
    const bigMicBtn = document.getElementById('bigMicBtn');
    const wtStatus = document.getElementById('wtStatus');
    const wtToggleBtn = document.getElementById('wtToggleBtn');

    let history = []; 
    let currentSummary = ""; 
    let isWTMode = false; 

    // --- VOICE LOGIC ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN'; recognition.continuous = false; recognition.interimResults = false;
        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            if (isWTMode) { userInput.value = text; sendMessage(); wtStatus.innerText = "Đã gửi: " + text; setTimeout(() => wtStatus.innerText = "Nhấn giữ để nói...", 2000); } 
            else { userInput.value = text; userInput.focus(); }
        };
        recognition.onerror = () => { if(isWTMode) wtStatus.innerText = "Lỗi. Thử lại."; };
    }

    function toggleVoiceMode() {
        isWTMode = !isWTMode;
        if (isWTMode) { normalInput.style.display = 'none'; wtInput.style.display = 'flex'; wtToggleBtn.classList.add('active'); } 
        else { normalInput.style.display = 'flex'; wtInput.style.display = 'none'; wtToggleBtn.classList.remove('active'); }
    }
    function startHold() { recognition?.start(); bigMicBtn.classList.add('recording'); wtStatus.innerText = "Đang nghe..."; }
    function endHold() { recognition?.stop(); bigMicBtn.classList.remove('recording'); wtStatus.innerText = "Đang xử lý..."; }
    function toggleNormalVoice() { 
        if(!recognition) return; 
        if(micBtn.classList.contains('active')) { recognition.stop(); micBtn.classList.remove('active'); } 
        else { recognition.start(); micBtn.classList.add('active'); } 
    }

    // --- CHAT LOGIC ---
    userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;
        appendMessage(text, 'user');
        userInput.value = '';
        if(!isWTMode) { userInput.blur(); toggleInput(false); }
        loading.style.display = 'block';
        scrollToBottom();

        const selectedModel = modelSelect.value;
        await sendRequestWithFallback(text, selectedModel, autoSwitchToggle.checked);
        if(!isWTMode) toggleInput(true);
    }

    async function sendRequestWithFallback(text, currentModel, autoSwitch) {
        try {
            const limit = parseInt(memLimitInput.value) || 2000;
            const hLimit = parseInt(historyLimitInput.value) || 10;

            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text, history: history, currentSummary: currentSummary,
                    maxMemoryLength: limit, historyLimit: hLimit, model: currentModel
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            loading.style.display = 'none';
            appendMessage(data.response, 'ai', true);

            if (data.newSummary) { currentSummary = data.newSummary; updateMemoryUI(currentSummary); }
            history.push({ role: "user", content: text });
            history.push({ role: "assistant", content: data.response });

        } catch (error) {
            const isOverloaded = error.message.includes("429") || error.message.includes("over capacity") || error.message.includes("Rate limit");
            if (isOverloaded && autoSwitch) {
                const nextModel = getNextModel(currentModel);
                if (nextModel) {
                    appendSystemMessage(`⚠️ ${currentModel} quá tải. Chuyển sang ${nextModel}...`);
                    modelSelect.value = nextModel;
                    await sendRequestWithFallback(text, nextModel, true);
                    return;
                }
            }
            loading.style.display = 'none';
            appendSystemMessage("❌ " + error.message);
        }
    }

    function getNextModel(curr) {
        const opts = Array.from(modelSelect.options).map(o => o.value);
        const idx = opts.indexOf(curr);
        return (idx !== -1 && idx < opts.length - 1) ? opts[idx + 1] : opts[0];
    }

    function appendMessage(text, sender, parseThink = false) {
        const div = document.createElement('div'); div.className = `message ${sender}`;
        if (sender === 'ai' && parseThink) {
            const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
            if (thinkMatch) {
                const thought = thinkMatch[1].trim();
                const content = text.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
                div.innerHTML = `
                    <div class="reasoning-box">
                        <div class="reasoning-header" onclick="this.parentElement.classList.toggle('open')">
                            <span class="arrow">▼</span> <span>Quá trình suy luận</span>
                        </div>
                        <div class="reasoning-content">${thought.replace(/\n/g, "<br>")}</div>
                    </div>
                    <div>${content.replace(/\n/g, "<br>")}</div>
                `;
            } else { div.innerHTML = text.replace(/\n/g, "<br>"); }
        } else { div.innerHTML = text.replace(/\n/g, "<br>"); }
        chatBox.insertBefore(div, loading); scrollToBottom();
    }

    function appendSystemMessage(text) {
        const div = document.createElement('div'); div.className = 'system'; div.innerText = text;
        chatBox.insertBefore(div, loading); scrollToBottom();
    }

    // --- UI HELPERS (Fix display flex cho memory) ---
    function switchTab(name) {
        document.getElementById('chatPanel').style.display = name === 'chat' ? 'flex' : 'none';
        document.getElementById('memoryPanel').style.display = name === 'chat' ? 'none' : 'flex'; // Dùng Flex để layout dọc
        document.getElementById('tabChat').className = name === 'chat' ? 'tab-btn active' : 'tab-btn';
        document.getElementById('tabMem').className = name === 'chat' ? 'tab-btn' : 'tab-btn active';
    }

    function updateMemoryUI(text) {
        const len = text ? text.length : 0;
        currLen.innerText = len + " chars";
        memoryDisplay.innerText = text || "Chưa có dữ liệu...";
    }

    function resetChat() {
        if (!confirm("Xóa toàn bộ?")) return;
        history = []; currentSummary = ""; updateMemoryUI("");
        chatBox.querySelectorAll('.message, .system').forEach(m => m.remove());
        switchTab('chat');
    }

    function toggleInput(enabled) { userInput.disabled = !enabled; sendBtn.disabled = !enabled; }
    function scrollToBottom() { chatBox.scrollTop = chatBox.scrollHeight; }
</script>

</body>
</html>
