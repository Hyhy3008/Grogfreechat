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

        // ── BƯỚC 2: CẬP NHẬT BỘ NÃO với lifecycle đúng ──────────────────
        //
        // Logic:
        // - Bộ não có ngân sách cố định = targetLength chars
        // - Khi history vượt historyLimit, tin cũ nhất được "consolidate" vào bộ não trước khi xóa
        // - Bộ não PHẢI nén lại nếu gần đầy: ưu tiên USER_PROFILE > KNOWLEDGE_GRAPH > LOG gần
        //   và LÀM MỜ / XÓA chi tiết cũ trong SHORT_TERM_LOG
        // - Kết quả luôn <= targetLength chars (model được nhắc hard limit)

        let newSummary = currentSummary;
        let memoryUpdated = true;

        // Kiểm tra xem có tin nhắn nào sắp bị đẩy ra khỏi short-term không
        // history hiện tại chưa push tin mới — nếu history.length >= historyLimit thì
        // tin đầu tiên (oldest) sắp bị slice ra
        const historyFull = (history || []).length >= targetHistoryLimit;
        const oldestPair  = historyFull ? (history || []).slice(0, 2) : []; // [user, assistant] cũ nhất

        // Tóm tắt cặp tin sắp bị xóa (nếu có) để inject vào prompt consolidation
        const evictedContext = oldestPair.length === 2
            ? `\nTIN NHẮN SẮP BỊ XÓA KHỎI SHORT-TERM (cần consolidate):\nUser: "${oldestPair[0]?.content}"\nAI: "${oldestPair[1]?.content}"`
            : "";

        const currentBrainSize = (currentSummary || "").length;
        const budgetUsedPct    = Math.round((currentBrainSize / targetLength) * 100);

        try {
            const memRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: MEMORY_MODEL,
                    temperature: 0.2,
                    max_tokens: 1024,
                    messages: [
                        {
                            role: "system",
                            content: `Bạn là Memory Manager. Nhiệm vụ: duy trì bộ nhớ dài hạn trong giới hạn ${targetLength} ký tự.

NGÂN SÁCH: ${currentBrainSize}/${targetLength} ký tự (${budgetUsedPct}% đã dùng).

QUY TẮC BẮT BUỘC:
1. Output PHẢI <= ${targetLength} ký tự. Đây là hard limit tuyệt đối.
2. Ưu tiên giữ theo thứ tự: USER_PROFILE > KNOWLEDGE_GRAPH > log gần đây > log cũ.
3. SHORT_TERM_LOG: chỉ giữ tối đa 5 dòng gần nhất. Các dòng cũ hơn → XÓA hoặc gộp thành 1 dòng tóm tắt.
4. KNOWLEDGE_GRAPH: nếu đầy, gộp các từ khóa cùng chủ đề, xóa từ khóa ít quan trọng.
5. Nếu có "TIN NHẮN SẮP BỊ XÓA" bên dưới → trích xuất thông tin quan trọng từ đó trước khi nó mất.
6. CHỈ trả về 4 section, KHÔNG thêm text nào khác ngoài format.

OUTPUT FORMAT (bắt buộc):
=== USER_PROFILE ===
(thông tin user: tên, sở thích, nghề nghiệp...)
=== CURRENT_GOAL ===
(mục tiêu hiện tại nếu có, nếu không có thì để trống)
=== KNOWLEDGE_GRAPH ===
(từ khóa quan trọng, cách nhau bởi dấu phẩy)
=== SHORT_TERM_LOG ===
(tối đa 5 dòng, mỗi dòng bắt đầu bằng "- ")`
                        },
                        {
                            role: "user",
                            content: `BỘ NÃO HIỆN TẠI:\n${currentSummary || '(trống)'}${evictedContext}\n\nHỘI THOẠI VỪA XẢY RA:\nUser: "${message}"\nAI: "${aiReply}"\n\nHãy cập nhật bộ não. Nhớ: output <= ${targetLength} ký tự.`
                        }
                    ]
                })
            });

            const memData = await memRes.json();
            if (memData.error) throw new Error(memData.error.message);

            const memContent = memData.choices?.[0]?.message?.content?.trim();

            if (memContent) {
                // Hard-clamp: nếu model vẫn vượt limit, cắt cứng (safety net)
                newSummary = memContent.length <= targetLength
                    ? memContent
                    : memContent.slice(0, targetLength);
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
