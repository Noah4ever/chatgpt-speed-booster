import { MessageManager } from "./MessageManager";

// Shared content-script instance so all modules operate on the same tracked message state.
export const messageManager = new MessageManager();
