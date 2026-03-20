// File: api/chat.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

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

        const tinyHistory = (history || []).slice(-targetHistoryLimit);

        // ── CHUẨN BỊ: context cho memory (tính trước khi gọi song song) ───

        // Nếu history đầy, cặp tin cũ nhất sắp bị slice → consolidate trước khi mất
        const historyFull    = (history || []).length >= targetHistoryLimit;
        const oldestPair     = historyFull ? (history || []).slice(0, 2) : [];
        const evictedContext = oldestPair.length === 2
            ? `\nTIN NHẮN SẮP BỊ XÓA (cần lưu lại nếu quan trọng):\nUser: "${oldestPair[0]?.content}"\nAI: "${oldestPair[1]?.content}"`
            : "";

        const currentBrainSize = (currentSummary || "").length;
        const budgetUsedPct    = Math.round((currentBrainSize / targetLength) * 100);

        const chatSystemPrompt = `VAI TRÒ: Trợ lý AI Thông Minh & Chuyên Nghiệp.

--- 📝 DỮ LIỆU BỘ NHỚ (NGỮ CẢNH HỘI THOẠI) ---
${currentSummary || "Chưa có dữ liệu."}
----------------------------------------------

QUY TẮC XỬ LÝ (TUÂN THỦ 100%):
1. PHÂN BIỆT RÕ RÀNG:
   - [DỮ LIỆU BỘ NHỚ] là những gì User và AI ĐÃ từng nói với nhau.
   - [KIẾN THỨC CỦA BẠN] là những gì bạn biết về thế giới.
2. KHI USER HỎI VỀ QUÁ KHỨ: nhìn vào Bộ nhớ, trả lời CÓ/CHƯA dựa trên từ khóa.
3. KHI USER HỎI KIẾN THỨC: dùng kiến thức của bạn để trả lời chi tiết.
4. PHONG CÁCH: Tự tin, ngắn gọn, đi thẳng vào vấn đề.`;

        // Xác định chế độ: NÉN KHẨN CẤP nếu đã vượt limit, CẬP NHẬT THƯỜNG nếu còn chỗ
        const isOverBudget = currentBrainSize > targetLength;
        const memoryMode   = isOverBudget
            ? `🚨 CHẾ ĐỘ NÉN KHẨN CẤP: Bộ não đang ở ${currentBrainSize} ký tự, vượt giới hạn ${targetLength} ký tự!
NHIỆM VỤ DUY NHẤT: Nén bộ não xuống còn dưới ${targetLength} ký tự.
- SHORT_TERM_LOG: chỉ giữ TỐI ĐA 3 dòng quan trọng nhất, xóa hết còn lại.
- KNOWLEDGE_GRAPH: giữ tối đa 10 từ khóa quan trọng nhất, xóa hết còn lại.
- USER_PROFILE: chỉ giữ thông tin cốt lõi (tên, nghề, sở thích chính).
- CURRENT_GOAL: 1 câu ngắn hoặc để trống.
KHÔNG được giữ nguyên bộ não cũ. BẮT BUỘC phải cắt giảm.`
            : `✅ CHẾ ĐỘ CẬP NHẬT: Còn ${targetLength - currentBrainSize} ký tự trống.
- Thêm thông tin mới từ hội thoại vào đúng section.
- SHORT_TERM_LOG: chỉ giữ tối đa 5 dòng gần nhất, xóa log cũ hơn.
- Nếu bộ não đang tiệm cận ${targetLength} ký tự thì bắt đầu gộp/cắt log cũ.`;

        const memorySystemPrompt = `Bạn là Memory Manager. Quản lý bộ nhớ dài hạn trong giới hạn cứng ${targetLength} ký tự.

TRẠNG THÁI: ${currentBrainSize}/${targetLength} ký tự (${budgetUsedPct}%).
${memoryMode}

QUY TẮC LUÔN ÁP DỤNG:
1. Output PHẢI <= ${targetLength} ký tự. Đếm kỹ trước khi trả về.
2. Ưu tiên giữ: USER_PROFILE > KNOWLEDGE_GRAPH > log gần > log cũ.
3. Nếu có "TIN NHẮN SẮP BỊ XÓA" → trích thông tin quan trọng trước khi mất.
4. CHỈ trả về 4 section theo format, KHÔNG thêm bất kỳ text nào khác.

FORMAT BẮT BUỘC:
=== USER_PROFILE ===
=== CURRENT_GOAL ===
=== KNOWLEDGE_GRAPH ===
=== SHORT_TERM_LOG ===`;

        // ── BƯỚC 1 & 2: GỌI SONG SONG — chat + memory cùng lúc ────────────
        // Cùng dùng targetModel, cùng key, nhưng 2 request độc lập chạy parallel
        // → tổng thời gian = max(chat, memory) thay vì chat + memory

        const [chatRes, memRes] = await Promise.all([
            fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: targetModel,
                    messages: [
                        { role: "system", content: chatSystemPrompt },
                        ...tinyHistory,
                        { role: "user", content: message }
                    ],
                    temperature: 0.7,
                    max_tokens: 2048
                })
            }),
            fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: targetModel,
                    messages: [
                        { role: "system", content: memorySystemPrompt },
                        {
                            role: "user",
                            content: `BỘ NÃO HIỆN TẠI:\n${currentSummary || '(trống)'}${evictedContext}\n\nHỘI THOẠI VỪA XẢY RA:\nUser: "${message}"\nAI: "[đang xử lý song song]"\n\nHãy cập nhật bộ não dựa trên tin nhắn của user. Nhớ: output <= ${targetLength} ký tự.`
                        }
                    ],
                    temperature: 0.2,
                    max_tokens: 1024
                })
            })
        ]);

        // ── XỬ LÝ KẾT QUẢ CHAT ───────────────────────────────────────────
        const chatData = await chatRes.json();
        if (chatData.error) throw new Error(chatData.error.message);
        const aiReply = chatData.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời.";

        // ── XỬ LÝ KẾT QUẢ MEMORY ─────────────────────────────────────────
        let newSummary    = currentSummary;
        let memoryUpdated = true;

        try {
            const memData = await memRes.json();
            if (memData.error) throw new Error(memData.error.message);

            const memContent = memData.choices?.[0]?.message?.content?.trim();
            if (memContent) {
                // Hard-clamp safety net nếu model vượt limit
                newSummary = memContent.length <= targetLength
                    ? memContent
                    : memContent.slice(0, targetLength);
            } else {
                memoryUpdated = false;
                console.warn("Memory returned empty, keeping old summary.");
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
