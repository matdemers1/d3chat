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
    console.log("[useWebSocket] Setting up WS handler");
    const unsubscribe = wsClient.subscribe((msg: WsMessage) => {
      console.log("[useWebSocket] Handling:", msg.type);
      switch (msg.type) {
        case "channel.new": {
          const channel = msg.channel as Channel;
          console.log("[useWebSocket] channel.new:", channel.id, channel);
          const state = useChatStore.getState();
          // Add channel to store if not already present
          if (!state.channels.some((c) => c.id === channel.id)) {
            console.log("[useWebSocket] Adding new channel to store");
            useChatStore.setState({
              channels: [...state.channels, channel],
            });
          } else {
            console.log("[useWebSocket] Channel already in store");
          }
          // Subscribe WS to the new channel for real-time messages
          console.log("[useWebSocket] Sending subscribe for channel:", channel.id);
          wsClient.send({
            type: "subscribe",
            channel_id: channel.id,
          } as WsMessage);
          break;
        }
        case "message.new": {
          const message = msg.message as Message;
          console.log(
            "[useWebSocket] message.new:",
            "id=", message.id,
            "channel=", message.channel_id,
            "sender=", message.sender_id,
            "protocol_version=", message.protocol_version,
            "sender_device_id=", message.sender_device_id,
            "content_len=", message.content?.length
          );

          if (message.protocol_version === 2) {
            // Read channels from store at call time to avoid stale closure
            const channels = useChatStore.getState().channels;
            const channel = channels.find(
              (c) => c.id === message.channel_id
            );
            // Determine encryption type — fall back to "sender_keys" for groups
            // if channel isn't in store yet (race with channel.new)
            const encryptionType = channel?.encryption_type ?? "sender_keys";
            console.log(
              "[useWebSocket] Decrypting message:",
              "encryptionType=", encryptionType,
              "channelFound=", !!channel
            );

            decryptFromChannel(
              message.channel_id,
              encryptionType,
              message.content,
              message.sender_device_id
            )
              .then((plaintext) => {
                console.log("[useWebSocket] Decryption success, plaintext_len=", plaintext.length);
                cacheMessagePlaintext(message.id, plaintext).catch(console.error);
                addMessage({ ...message, content: plaintext });
              })
              .catch((err) => {
                console.error("[useWebSocket] Decryption FAILED:", err);
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
          console.log("[useWebSocket] sender_key.new for channel:", channelId);
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
        default: {
          console.log("[useWebSocket] Unhandled message type:", msg.type);
        }
      }
    });

    return unsubscribe;
  }, [addMessage, updateMessage, removeMessage, setTyping]);
}
