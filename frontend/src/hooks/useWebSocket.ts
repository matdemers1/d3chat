import { useEffect } from "react";
import { wsClient } from "@/api/ws";
import { useChatStore } from "@/store/chatStore";
import { decryptFromChannel, fetchAndStoreSenderKeys } from "@/crypto/encrypt";
import { cacheMessagePlaintext } from "@/crypto/keyStore";
import { replenishOneTimeKeys } from "@/crypto/bootstrap";
import type { Channel, Message, WsMessage } from "@/types";

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
              .then((plaintext) => {
                cacheMessagePlaintext(message.id, plaintext).catch(console.error);
                addMessage({ ...message, content: plaintext });
              })
              .catch((err) => {
                console.error("[decrypt] Failed:", err);
                addMessage({
                  ...message,
                  content: "[Unable to decrypt]",
                });
              });
            break;
          }

          addMessage(message);
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
