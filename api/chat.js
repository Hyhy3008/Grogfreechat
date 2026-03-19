// File: api/chat.js (FINAL VERSION)

export default async function handler(req, res) {
    // Chỉ chấp nhận method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- CẤU HÌNH API KEYS ---
    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    
    // 👇👇 THÔNG TIN CLOUDFLARE (Điền cứng của bạn) 👇👇
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 
    // ---------------------------------------------------

    try {
        // Nhận dữ liệu từ Frontend
        const { message, history, currentSummary, maxMemoryLength, model } = req.body;
        
        // Cấu hình mặc định nếu thiếu
        const targetModel = model || "llama-3.3-70b-versatile";
        const targetLength = maxMemoryLength || 2000;

        // ======================================================
        // BƯỚC 1: GROQ TRẢ LỜI (LOGIC SUY LUẬN + KIẾN THỨC)
        // ======================================================

        // Chỉ lấy 2 tin nhắn gần nhất làm ngữ cảnh ngắn hạn
        const tinyHistory = (history || []).slice(-2); 

        const systemPrompt = `
        VAI TRÒ: Trợ lý AI Thông Minh & Chuyên Nghiệp.

        --- 📝 DỮ LIỆU BỘ NHỚ (NGỮ CẢNH HỘI THOẠI) ---
        ${currentSummary || "Chưa có dữ liệu."}
        ----------------------------------------------

        QUY TẮC XỬ LÝ (TUÂN THỦ 100%):

        1. **PHÂN BIỆT RÕ RÀNG:**
           - [DỮ LIỆU BỘ NHỚ] là những gì User và AI ĐÃ từng nói với nhau.
           - [KIẾN THỨC CỦA BẠN] là những gì bạn biết về thế giới (Khoa học, Lịch sử, Địa lý...).

        2. **KHI USER HỎI VỀ QUÁ KHỨ (Check Memory):**
           - Ví dụ: "Tôi đã hỏi gì?", "Tôi có nhắc đến X không?".
           - Hãy nhìn vào Bộ nhớ. Nếu thấy từ khóa X -> TRẢ LỜI: "CÓ". Nếu không thấy -> TRẢ LỜI: "CHƯA".
           - Tuyệt đối tin tưởng vào danh sách từ khóa trong bộ nhớ.

        3. **KHI USER HỎI KIẾN THỨC (Check Knowledge):**
           - Ví dụ: "Đà Nẵng có gì vui?", "Cách nấu Phở?".
           - Hãy dùng **KIẾN THỨC CỦA BẠN** để trả lời chi tiết và hữu ích.
           - Đừng phụ thuộc vào bộ nhớ (trừ khi để tránh lặp lại những gì đã nói).

        4. **PHONG CÁCH:** Tự tin, ngắn gọn, đi thẳng vào vấn đề.
        `;

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: targetModel, // Dùng model do user chọn
                messages: [
                    { role: "system", content: systemPrompt },
                    ...tinyHistory,
                    { role: "user", content: message }
                ],
                temperature: 0.6, // Mức cân bằng giữa Sáng tạo và Chính xác
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        
        // Kiểm tra lỗi từ Groq (ví dụ sai tên model)
        if (groqData.error) {
            throw new Error(`Groq Error: ${groqData.error.message}`);
        }

        const aiReply = groqData.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời.";


        // ======================================================
        // BƯỚC 2: CLOUDFLARE TÓM TẮT & GHI NHỚ (COMPACT MODE)
        // ======================================================
        
        const updateMemoryPrompt = `
        Nhiệm vụ: Quản lý và Cập nhật Bộ nhớ (Memory Manager).
        Mục tiêu: Lưu trữ thông tin dưới dạng TỪ KHÓA (Keywords) để tiết kiệm dung lượng.

        DỮ LIỆU CŨ: 
        ${currentSummary || ''}

        HỘI THOẠI MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        QUY TẮC CẬP NHẬT (NGHIÊM NGẶT):

        1. === KNOWLEDGE_GRAPH ===:
           - Chỉ lưu DANH TỪ RIÊNG (Địa điểm, Món ăn, Tên người, Khái niệm quan trọng).
           - Định dạng: Liệt kê ngăn cách bằng dấu phẩy.
           - NGUYÊN TẮC: CỘNG DỒN (Append Only). Giữ từ khóa cũ, thêm từ khóa mới. KHÔNG ĐƯỢC XÓA CŨ.
           - Ví dụ: "Hà Nội, Phở, Đà Nẵng, Cầu Rồng".

        2. === USER_PROFILE ===:
           - Ghi lại thông tin cá nhân User (Tên, Sở thích...).

        3. === SHORT_TERM_LOG ===:
           - Ghi lại hành động chính của User theo dòng thời gian.
           - Ví dụ: "- User hỏi về du lịch -> AI gợi ý Đà Nẵng."

        YÊU CẦU ĐỘ DÀI: Tổng cộng không quá ${targetLength} ký tự.
        
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
                prompt: "Update Compact Memory", 
                systemPrompt: updateMemoryPrompt, 
                history: [] 
            })
        });

        const cfData = await cfRes.json();
        const newSummary = cfData.response || currentSummary;

        // ======================================================
        // BƯỚC 3: TRẢ KẾT QUẢ VỀ CLIENT
        // ======================================================
        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
