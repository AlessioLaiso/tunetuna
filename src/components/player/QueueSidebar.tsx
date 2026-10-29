import { X } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import QueueList from './QueueList'
import QueueMenu from './QueueMenu'
import { useEffect } from 'react'
import { SurfaceBackdrop } from '../layout/AppBackground'
import QueueSidebarPanel from './QueueSidebarPanel'
import { useAppBackgroundActive } from '../../hooks/useAppBackground'

export default function QueueSidebar() {
    const { isQueueSidebarOpen, toggleQueueSidebar } = usePlayerStore()
    const hasAppBackground = useAppBackgroundActive()

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

    // On album art, match the player modal's queue sidebar exactly
    if (hasAppBackground) {
        return (
            <div
                className="fixed top-0 right-0 bottom-0 z-30 flex-col hidden xl:flex"
                style={{
                    width: 'var(--sidebar-width)',
                    paddingTop: 'var(--header-offset, 0px)',
                }}
            >
                <SurfaceBackdrop />
                <QueueSidebarPanel isOpen onClose={toggleQueueSidebar} contentPaddingBottom="8rem" />
            </div>
        )
    }

    return (
        <div
            className="fixed top-0 right-0 bottom-0 bg-black border-l border-white/15 z-30 flex flex-col hidden xl:flex shadow-xl"
            style={{
                width: 'var(--sidebar-width)',
                paddingTop: 'var(--header-offset, 0px)',
            }}
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/15 flex-shrink-0">
                <h2 className="text-base font-bold text-white tracking-wider">Queue</h2>
                <div className="flex items-center">
                    <QueueMenu />
                    <button
                        onClick={toggleQueueSidebar}
                        className="text-white/60 hover:text-white transition-colors p-2 rounded-full hover:bg-white/15"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <QueueList contentPaddingBottom="8rem" />
        </div>
    )
}
