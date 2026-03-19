export default async function handler(req, res) {
    // Chỉ chấp nhận POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- CẤU HÌNH ---
    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    
    // 👇👇 THÔNG TIN CLOUDFLARE (Điền cứng của bạn) 👇👇
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 
    // ---------------------------------------------------

    try {
        const { message, history, currentSummary } = req.body;

        // ======================================================
        // BƯỚC 1: GROQ SUY LUẬN & TRẢ LỜI
        // ======================================================

        // Chỉ lấy 2 tin nhắn gần nhất để gửi Groq (Tiết kiệm & Nhanh)
        const tinyHistory = (history || []).slice(-2); 

        // System Prompt: Ép AI phải đọc Tóm tắt để hiểu ngữ cảnh cũ
        const systemPrompt = `
        BẠN LÀ TRỢ LÝ AI THÔNG MINH (Model Llama-3 70B).

        --- DỮ LIỆU KÝ ỨC (CONTEXT) ---
        ${currentSummary ? currentSummary : "Chưa có thông tin gì."}
        --------------------------------

        NHIỆM VỤ:
        1. Trả lời câu hỏi hiện tại của User.
        2. KẾT HỢP KÝ ỨC: Nếu User hỏi những câu thiếu chủ ngữ (ví dụ: "Ở đó ăn gì ngon?", "Vé đắt không?"), hãy nhìn vào phần "DỮ LIỆU KÝ ỨC" để biết User đang nói về địa điểm nào (Hà Nội? Đà Nẵng? hay Sài Gòn?).
        3. Nếu ký ức không rõ ràng, hãy HỎI LẠI User để xác nhận.
        4. Trả lời ngắn gọn, hữu ích, tiếng Việt tự nhiên.
        `;

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...tinyHistory,
                    { role: "user", content: message }
                ],
                temperature: 0.6,
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        
        // Xử lý lỗi nếu Groq bị quá tải
        if (groqData.error) throw new Error(groqData.error.message);
        
        const aiReply = groqData.choices?.[0]?.message?.content || "Xin lỗi, tôi đang suy nghĩ...";


        // ======================================================
        // BƯỚC 2: CLOUDFLARE GHI NHỚ (CỘNG DỒN THÔNG TIN)
        // ======================================================
        
        // Đây là Prompt quan trọng nhất để sửa lỗi "Quên bài cũ"
        const updateMemoryPrompt = `
        Bạn là Thư Ký Ghi Chép Thông Minh.
        
        DỮ LIỆU CŨ: "${currentSummary || 'Chưa có'}"
        
        HỘI THOẠI MỚI NHẤT:
        User: "${message}"
        AI: "${aiReply}"
        
        NHIỆM VỤ CẬP NHẬT (QUAN TRỌNG):
        1. KHÔNG ĐƯỢC XÓA thông tin cũ. Bạn phải DUY TRÌ một danh sách các chủ đề đã thảo luận.
        2. Nếu User chuyển chủ đề (ví dụ từ Hà Nội sang Đà Nẵng), hãy ghi thêm vào: "Đã bàn về Hà Nội, và hiện tại đang hỏi về Đà Nẵng".
        3. Ghi lại các sở thích, thông tin cá nhân (Tên, tuổi, nghề...) nếu User nhắc đến.
        4. Loại bỏ các chi tiết vụn vặt (như câu chào, câu cảm ơn).
        5. Kết quả trả về là một đoạn văn tóm tắt súc tích, bao gồm cả quá khứ và hiện tại.
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Update Memory", // Prompt giả (không quan trọng)
                systemPrompt: updateMemoryPrompt, // Prompt thật nằm ở đây
                history: [] // Không cần history dài dòng
            })
        });

        const cfData = await cfRes.json();
        const newSummary = cfData.response || currentSummary;

        // ======================================================
        // BƯỚC 3: TRẢ KẾT QUẢ VỀ CHO USER
        // ======================================================
        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary // Gửi cái tóm tắt mới nhất về để lần sau dùng tiếp
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
