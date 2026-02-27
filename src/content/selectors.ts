export const Selectors = Object.freeze({
    conversationContainer: 'div[role="presentation"] .flex.flex-col.items-center',
    messageTurn: '[data-testid^="conversation-turn-"]',
    promptTextarea: "#prompt-textarea",
    sendButton: '[data-testid="send-button"]',
    scrollContainer: 'div[class*="react-scroll-to-bottom"] > div[class*="flex"]',
    scrollContainerAlt: "main .overflow-y-auto",
});
