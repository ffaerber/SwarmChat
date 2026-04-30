export default function ChatList() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0d0a08]">
      <div className="text-center max-w-sm px-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-[#221b16] border border-[#2e261f] flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#ff7a00]" fill="currentColor">
            <path d="M12 2 3 7v6l9 5 9-5V7l-9-5z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-[#f5ede4] mb-2">SwarmChat</h2>
        <p className="text-sm text-[#a39690]">
          Decentralized messaging on Swarm + Gnosis Chain. Pick a conversation
          on the left, or browse the Directory to start a new one.
        </p>
      </div>
    </div>
  )
}
