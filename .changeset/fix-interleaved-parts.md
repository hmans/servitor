---
"@hmans/servitor": patch
---

Fix message rendering to preserve interleaved ordering of text and tool invocations

Text and tool invocations within an assistant turn are now stored as ordered `parts` and rendered in their original sequence, both during streaming and after persistence. Previously all tool invocations were grouped together before the text content.
