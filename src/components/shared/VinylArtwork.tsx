import { useLargeViewport } from '../../hooks/useLargeViewport'
import Image from './Image'
import vinylImage from '../../assets/vinyl.png'
import cdImage from '../../assets/cd.png'

interface VinylArtworkProps {
  coverImageSrc: string
  coverImageAlt: string
  discImageUrl: string | null
  artistLogoUrl: string | null
  hasArtistLogo: boolean
  // Vinyl animation state (from useVinylAnimation)
  showVinyl: boolean
  hideAlbumArt: boolean
  rotationAngle: number
  shouldSplitRef: React.MutableRefObject<boolean>
  isPlaying: boolean
  // Display
  isCassette?: boolean
  isCD?: boolean
  // Callbacks
  onCoverError: () => void
  onDiscImageError: () => void
  onArtistLogoError: () => void
}

export default function VinylArtwork({
  coverImageSrc,
  coverImageAlt,
  discImageUrl,
  artistLogoUrl,
  hasArtistLogo,
  showVinyl,
  hideAlbumArt,
  rotationAngle,
  shouldSplitRef,
  isPlaying,
  isCassette = false,
  isCD = false,
  onCoverError,
  onDiscImageError,
  onArtistLogoError,
}: VinylArtworkProps) {
  const isLargeViewport = useLargeViewport()

  return (
    <div className="flex justify-center mb-6 relative" style={{ overflowX: 'visible', overflowY: 'visible', paddingLeft: '16px', paddingRight: '16px' }}>
      <div
        className="relative"
        style={{
          overflow: 'visible',
          width: isLargeViewport ? '360px' : '256px',
          height: isLargeViewport ? '360px' : '256px',
        }}
      >
        {/* Disc */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{
            opacity: showVinyl ? 1 : 0,
            zIndex: 1,
            transform: (isPlaying && shouldSplitRef.current)
              ? 'translateX(calc(50% + 8px))'
              : 'translateX(0)',
            transition: 'transform 500ms ease-in-out, opacity 300ms ease-in-out',
          }}
        >
          <div
            className="w-full h-full"
            style={{ transformOrigin: 'center center', transform: `rotate(${rotationAngle}deg)` }}
          >
            {discImageUrl ? (
              <img
                src={discImageUrl}
                alt="Disc"
                className="w-full h-full object-cover rounded-full"
                onError={onDiscImageError}
              />
            ) : isCD ? (
              /* CD fallback: plain CD image with optional artist logo in the top half */
              <>
                <img
                  src={cdImage}
                  alt="CD"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                {hasArtistLogo && artistLogoUrl && (
                  <div
                    className="absolute left-1/2 overflow-hidden flex items-center justify-center"
                    style={{
                      width: '45%',
                      height: '22%',
                      top: '8%',
                      transform: 'translateX(-50%)',
                      transformOrigin: 'center center',
                    }}
                  >
                    <img
                      src={artistLogoUrl}
                      alt="Artist Logo"
                      className="w-full h-full object-contain"
                      onError={onArtistLogoError}
                    />
                  </div>
                )}
              </>
            ) : (
              /* Vinyl fallback */
              <>
                <img
                  src={vinylImage}
                  alt="Vinyl Record"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
                {/* Zinc 400 circle covering white center */}
                {(hasArtistLogo || coverImageSrc) && (
                  <div
                    className="absolute top-1/2 left-1/2 rounded-full"
                    style={{
                      width: '52%',
                      height: '52%',
                      backgroundColor: '#a1a1aa',
                      transform: 'translate(-50%, -50%)',
                      transformOrigin: 'center center',
                    }}
                  />
                )}
                {/* Artist Logo or Album Art Overlay */}
                {hasArtistLogo && artistLogoUrl ? (
                  <div
                    className="absolute top-1/2 left-1/2 rounded-full overflow-hidden flex items-center justify-center"
                    style={{
                      width: '47%',
                      height: '47%',
                      transform: 'translate(-50%, -50%)',
                      transformOrigin: 'center center',
                    }}
                  >
                    <img
                      src={artistLogoUrl}
                      alt="Artist Logo"
                      className="w-full h-full object-contain"
                      onError={onArtistLogoError}
                    />
                  </div>
                ) : coverImageSrc ? (
                  <div
                    className="absolute top-1/2 left-1/2 rounded-full overflow-hidden flex items-center justify-center"
                    style={{
                      width: '52%',
                      height: '52%',
                      transform: 'translate(-50%, -50%)',
                      transformOrigin: 'center center',
                    }}
                  >
                    <img src={coverImageSrc} alt={coverImageAlt} className="w-full h-full object-cover" />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* Album Art */}
        <div
          className={`absolute inset-0 rounded overflow-hidden ${isCassette ? '' : 'bg-zinc-900'} transition-all duration-500`}
          style={{
            transform: !isCassette && isPlaying
              ? shouldSplitRef.current
                ? 'translateX(calc(-50% - 8px))'
                : 'translateX(calc(-100% - 24px))'
              : !isCassette && hideAlbumArt
                ? shouldSplitRef.current
                  ? 'translateX(calc(-50% - 8px))'
                  : 'translateX(calc(-100% - 24px))'
                : 'translateX(0)',
            opacity: 1,
            transitionProperty: 'transform',
            transitionDuration: '500ms',
            transitionTimingFunction: 'ease-in-out',
            zIndex: 10,
          }}
        >
          {coverImageSrc ? (
            <Image
              src={coverImageSrc}
              alt={coverImageAlt}
              className={`w-full h-full ${isCassette ? 'object-contain' : 'object-cover'}`}
              showOutline={!isCassette}
              rounded="rounded"
              onError={onCoverError}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 rounded">
              No Image
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
