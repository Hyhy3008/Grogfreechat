// File: api/chat.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    // CF Worker đã bị loại bỏ — memory summarization dùng Groq model nhỏ riêng
    const MEMORY_MODEL = "llama-3.1-8b-instant"; // Nhanh, nhẹ, đủ dùng cho tóm tắt

    try {
        const {
            message,
            history,
            currentSummary,
            maxMemoryLength,
            model,
            historyLimit
        } = req.body;

        const targetModel        = model || "llama-3.3-70b-versatile";
        const targetLength       = maxMemoryLength || 2000;
        const targetHistoryLimit = historyLimit || 10;

        // ── BƯỚC 1: GROQ TRẢ LỜI ──────────────────────────────────────────

        // FIX: frontend đã slice rồi, nhưng slice lần nữa để an toàn phía server
        const tinyHistory = (history || []).slice(-targetHistoryLimit);

        const systemPrompt = `
VAI TRÒ: Trợ lý AI Thông Minh & Chuyên Nghiệp.

--- 📝 DỮ LIỆU BỘ NHỚ (NGỮ CẢNH HỘI THOẠI) ---
${currentSummary || "Chưa có dữ liệu."}
----------------------------------------------

QUY TẮC XỬ LÝ (TUÂN THỦ 100%):

1. PHÂN BIỆT RÕ RÀNG:
   - [DỮ LIỆU BỘ NHỚ] là những gì User và AI ĐÃ từng nói với nhau.
   - [KIẾN THỨC CỦA BẠN] là những gì bạn biết về thế giới.

2. KHI USER HỎI VỀ QUÁ KHỨ (Check Memory):
   - Nhìn vào Bộ nhớ. Nếu thấy từ khóa -> TRẢ LỜI: "CÓ". Nếu không -> TRẢ LỜI: "CHƯA".
   - Tuyệt đối tin tưởng vào danh sách từ khóa trong bộ nhớ.

3. KHI USER HỎI KIẾN THỨC (Check Knowledge):
   - Dùng KIẾN THỨC CỦA BẠN để trả lời chi tiết và hữu ích.

4. PHONG CÁCH: Tự tin, ngắn gọn, đi thẳng vào vấn đề.
`;

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: targetModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...tinyHistory,
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        const groqData = await groqRes.json();
        if (groqData.error) {
            throw new Error(groqData.error.message);
        }

        const aiReply = groqData.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời.";

        // ── BƯỚC 2: GROQ CẬP NHẬT BỘ NÃO (thay thế CF Worker) ────────────

        let newSummary = currentSummary;
        let memoryUpdated = true;

        try {
            const memRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: MEMORY_MODEL,
                    temperature: 0.3, // Thấp hơn cho tác vụ tóm tắt — ít sáng tạo, ổn định hơn
                    max_tokens: 1024,
                    messages: [
                        {
                            role: "system",
                            content: `Nhiệm vụ: Quản lý và Cập nhật Bộ nhớ (Memory Manager).
Mục tiêu: Lưu trữ thông tin dưới dạng TỪ KHÓA để tiết kiệm dung lượng.

QUY TẮC CẬP NHẬT (NGHIÊM NGẶT):
1. === KNOWLEDGE_GRAPH ===:
   - Chỉ lưu DANH TỪ RIÊNG (Địa điểm, Món ăn, Tên người, Khái niệm quan trọng).
   - Định dạng: Liệt kê ngăn cách bằng dấu phẩy.
   - NGUYÊN TẮC: CỘNG DỒN (Append Only). Giữ từ khóa cũ, thêm từ khóa mới.
2. === USER_PROFILE ===: Ghi lại thông tin cá nhân User (Tên, Sở thích...).
3. === CURRENT_GOAL ===: Mục tiêu hiện tại của User nếu có.
4. === SHORT_TERM_LOG ===: Ghi lại hành động chính của User theo dòng thời gian.

YÊU CẦU ĐỘ DÀI: Tổng cộng không quá ${targetLength} ký tự.
CHỈ trả về đúng 4 section theo format, KHÔNG thêm bất kỳ text nào khác.

OUTPUT FORMAT:
=== USER_PROFILE ===
=== CURRENT_GOAL ===
=== KNOWLEDGE_GRAPH ===
=== SHORT_TERM_LOG ===`
                        },
                        {
                            role: "user",
                            content: `DỮ LIỆU CŨ:\n${currentSummary || '(trống)'}\n\nHỘI THOẠI MỚI:\nUser: "${message}"\nAI: "${aiReply}"\n\nHãy cập nhật và trả về bộ nhớ mới.`
                        }
                    ]
                })
            });

            const memData = await memRes.json();

            if (memData.error) {
                throw new Error(memData.error.message);
            }

            const memContent = memData.choices?.[0]?.message?.content;
            if (memContent) {
                newSummary = memContent;
            } else {
                memoryUpdated = false;
                console.warn("Memory model returned empty, keeping old summary.");
            }
        } catch (memError) {
            memoryUpdated = false;
            console.error("Memory update error:", memError.message);
        }

        // ── BƯỚC 3: TRẢ KẾT QUẢ ──────────────────────────────────────────

        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary,
            memoryUpdated: memoryUpdated  // FIX: frontend dùng flag này để hiện cảnh báo
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
