export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 

    try {
        // Nhận thêm tham số maxMemoryLength từ Client
        const { message, history, currentSummary, maxMemoryLength } = req.body;

        // Giá trị mặc định nếu bạn không điền là 2000 ký tự
        const targetLength = maxMemoryLength || 2000;

        // ======================================================
        // BƯỚC 1: GROQ TRẢ LỜI (GIỮ NGUYÊN)
        // ======================================================
        const tinyHistory = (history || []).slice(-2); 

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `BẠN LÀ TRỢ LÝ AI.\n--- BỘ NHỚ ---\n${currentSummary || "Chưa có."}\n--------------\nNHIỆM VỤ: Trả lời ngắn gọn, thông minh.` 
                    },
                    ...tinyHistory,
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "...";

        // ======================================================
        // BƯỚC 2: CLOUDFLARE TÓM TẮT (CÓ GIỚI HẠN ĐỘ DÀI)
        // ======================================================
        
        const updateMemoryPrompt = `
        Bạn là Quản Lý Bộ Nhớ.
        
        NHIỆM VỤ: Cập nhật thông tin mới vào cấu trúc bộ nhớ hiện tại.
        
        ⚠️ YÊU CẦU QUAN TRỌNG VỀ ĐỘ DÀI:
        - Người dùng yêu cầu giới hạn bộ nhớ tối đa là: ${targetLength} ký tự.
        - Hãy viết tóm tắt thật SÚC TÍCH, CÔ ĐỌNG.
        - Nếu dữ liệu cũ quá dài, hãy lược bỏ các chi tiết phụ, chỉ giữ lại ý chính (Keywords).
        - Ưu tiên giữ lại: Thông tin cá nhân User (Profile) và Bối cảnh hiện tại.

        DỮ LIỆU CŨ: 
        ${currentSummary || ''}

        HỘI THOẠI MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        OUTPUT FORMAT (Giữ nguyên tiêu đề):
        === USER_PROFILE ===
        === CURRENT_GOAL ===
        === KNOWLEDGE_GRAPH ===
        === SHORT_TERM_LOG ===
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Update Memory Limit", 
                systemPrompt: updateMemoryPrompt, 
                history: [] 
            })
        });

        const cfData = await cfRes.json();
        const newSummary = cfData.response || currentSummary;

        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
