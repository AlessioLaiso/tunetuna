import { X } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import QueueList from './QueueList'
import { useEffect } from 'react'

export default function QueueSidebar() {
    const { isQueueSidebarOpen, toggleQueueSidebar } = usePlayerStore()

    // Close sidebar on escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isQueueSidebarOpen) {
                toggleQueueSidebar()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isQueueSidebarOpen, toggleQueueSidebar])

    if (!isQueueSidebarOpen) return null

    return (
        <div
            className="fixed top-0 right-0 bottom-0 w-[320px] bg-black border-l border-zinc-800 z-30 flex flex-col hidden xl:flex shadow-xl"
            style={{
                paddingTop: 'var(--header-offset, 0px)',
            }}
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
                <h2 className="text-sm font-bold text-white tracking-wider">Queue</h2>
                <button
                    onClick={toggleQueueSidebar}
                    className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-zinc-800"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
            <QueueList contentPaddingBottom="8rem" />
        </div>
    )
}
