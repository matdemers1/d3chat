import { useEffect } from "react";
import { wsClient } from "@/api/ws";
import { useChatStore } from "@/store/chatStore";
import { decryptFromChannel, fetchAndStoreSenderKeys } from "@/crypto/encrypt";
import { cacheMessagePlaintext, getCachedPlaintext } from "@/crypto/keyStore";
import { replenishOneTimeKeys } from "@/crypto/bootstrap";
import type { Channel, Message, ReplySnippet, WsMessage } from "@/types";

export function useWebSocket() {
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setTyping = useChatStore((s) => s.setTyping);

  useEffect(() => {
    const unsubscribe = wsClient.subscribe((msg: WsMessage) => {
      switch (msg.type) {
        case "channel.new": {
          const channel = msg.channel as Channel;
          const state = useChatStore.getState();
          if (!state.channels.some((c) => c.id === channel.id)) {
            useChatStore.setState({
              channels: [...state.channels, channel],
            });
          }
          wsClient.send({
            type: "subscribe",
            channel_id: channel.id,
          } as WsMessage);
          break;
        }
        case "message.new": {
          const message = msg.message as Message;

          // Decrypt reply_to snippet if encrypted
          const decryptReplySnippet = async (snippet: ReplySnippet | null): Promise<ReplySnippet | null> => {
            if (!snippet) return null;
            if (snippet.protocol_version !== 2) return snippet;
            const cached = await getCachedPlaintext(snippet.id);
            if (cached !== undefined) return { ...snippet, content: cached };
            return { ...snippet, content: "[Encrypted message]" };
          };

          if (message.protocol_version === 2) {
            const channels = useChatStore.getState().channels;
            const channel = channels.find(
              (c) => c.id === message.channel_id
            );
            const encryptionType = channel?.encryption_type ?? "sender_keys";

            decryptFromChannel(
              message.channel_id,
              encryptionType,
              message.content,
              message.sender_device_id
            )
              .then(async (plaintext) => {
                cacheMessagePlaintext(message.id, plaintext).catch(console.error);
                const replyTo = await decryptReplySnippet(message.reply_to);
                addMessage({ ...message, content: plaintext, reply_to: replyTo });
              })
              .catch(async (err) => {
                console.error("[decrypt] Failed:", err);
                const replyTo = await decryptReplySnippet(message.reply_to);
                addMessage({
                  ...message,
                  content: "[Unable to decrypt]",
                  reply_to: replyTo,
                });
              });
            break;
          }

          decryptReplySnippet(message.reply_to).then((replyTo) => {
            addMessage({ ...message, reply_to: replyTo });
          });
          break;
        }
        case "message.edit": {
          const m = msg.message as {
            id: string;
            channel_id: string;
            content: string;
            edited_at: string;
          };
          updateMessage(m.id, m.channel_id, m.content, m.edited_at);
          break;
        }
        case "message.delete": {
          removeMessage(
            msg.message_id as string,
            msg.channel_id as string
          );
          break;
        }
        case "typing.start": {
          setTyping(
            msg.channel_id as string,
            msg.user_id as string,
            true
          );
          break;
        }
        case "typing.stop": {
          setTyping(
            msg.channel_id as string,
            msg.user_id as string,
            false
          );
          break;
        }
        case "sender_key.new": {
          const channelId = msg.channel_id as string;
          fetchAndStoreSenderKeys(channelId).catch(console.error);
          break;
        }
        case "keys.low_otp": {
          const deviceId = msg.device_id as string;
          const localDeviceId = localStorage.getItem("device_id");
          if (deviceId === localDeviceId) {
            replenishOneTimeKeys(deviceId).catch(console.error);
          }
          break;
        }
      }
    });

    return unsubscribe;
  }, [addMessage, updateMessage, removeMessage, setTyping]);
}
