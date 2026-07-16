-- Categoria adicional de template/mensagem: "Follow-up após conversa".
-- Aditivo e idempotente (não altera dados existentes).
alter type message_kind add value if not exists 'after_conversation';
