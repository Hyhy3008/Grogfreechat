// File: api/chat.js

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // --- CẤU HÌNH ---
    const GROQ_API_KEY = process.env.GROQ_API_KEY; // Lấy từ Vercel Env
    
    // 👇👇 ĐIỀN CỨNG CLOUDFLARE CỦA BẠN VÀO ĐÂY 👇👇
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 
    // ------------------------------------------------

    try {
        const { message, history, currentSummary } = req.body;

        // ======================================================
        // BƯỚC 1: GROQ (Trả lời câu hỏi)
        // ======================================================
        
        // Tạo System Prompt dựa trên trí nhớ
        const systemPrompt = currentSummary 
            ? `Thông tin đã nhớ về user: "${currentSummary}". Hãy trả lời hữu ích và tự nhiên.`
            : "Bạn là trợ lý AI hữu ích.";

        // Chỉ lấy 5 tin nhắn gần nhất để gửi Groq (tiết kiệm)
        const recentMessages = (history || []).slice(-5);

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // Model xịn nhất
                messages: [
                    { role: "system", content: systemPrompt },
                    ...recentMessages,
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "Lỗi Groq";

        // ======================================================
        // BƯỚC 2: CLOUDFLARE (Tóm tắt / Ghi chép)
        // ======================================================
        
        const summaryPrompt = `
        Nhiệm vụ: Cập nhật thông tin tóm tắt về User.
        - Tóm tắt cũ: "${currentSummary || 'Chưa có'}"
        - Hội thoại mới: User nói "${message}" -> AI đáp "${aiReply}"
        
        Yêu cầu:
        1. Chỉ giữ lại thông tin quan trọng (Tên, tuổi, sở thích, công việc, dự định...).
        2. Nếu không có gì mới, giữ nguyên tóm tắt cũ.
        3. Trả về nội dung tóm tắt ngắn gọn. KHÔNG giải thích.
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Summarize", // Prompt user giả
                systemPrompt: summaryPrompt, // System prompt chứa lệnh tóm tắt
                history: [] // Không cần history
            })
        });

        const cfData = await cfRes.json();
        const newSummary = cfData.response || currentSummary;

        // ======================================================
        // BƯỚC 3: TRẢ VỀ KẾT QUẢ
        // ======================================================
        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
