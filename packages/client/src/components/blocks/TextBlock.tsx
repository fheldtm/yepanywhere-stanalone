import { memo, useEffect, useState } from "react";
import { useStreamingMarkdownContext } from "../../contexts/StreamingMarkdownContext";
import { useStreamingMarkdown } from "../../hooks/useStreamingMarkdown";
import { LocalMediaModal, useLocalMediaClick } from "../LocalMediaModal";

interface Props {
  text: string;
  isStreaming?: boolean;
  /** Pre-rendered HTML from server (for completed messages) */
  augmentHtml?: string;
}

export const TextBlock = memo(function TextBlock({
  text,
  isStreaming = false,
  augmentHtml,
}: Props) {
  // Streaming markdown hook for server-rendered content
  const streamingMarkdown = useStreamingMarkdown();
  const streamingContext = useStreamingMarkdownContext();

  // Track whether we're actively using streaming markdown (received at least one augment)
  const [useStreamingContent, setUseStreamingContent] = useState(false);

  // Register with context when streaming and context is available
  useEffect(() => {
    if (!isStreaming || !streamingContext) {
      // Reset streaming state when not streaming
      // (HTML is captured to markdownAugments before component remounts)
      if (!isStreaming) {
        setUseStreamingContent(false);
        streamingMarkdown.reset();
      }
      return;
    }

    // Register handlers with the context
    const unregister = streamingContext.registerStreamingHandler({
      onAugment: (augment) => {
        // Mark that we're using streaming content on first augment
        setUseStreamingContent(true);
        streamingMarkdown.onAugment(augment);
      },
      onPending: streamingMarkdown.onPending,
      onStreamEnd: streamingMarkdown.onStreamEnd,
      captureHtml: streamingMarkdown.captureHtml,
    });

    return unregister;
  }, [isStreaming, streamingContext, streamingMarkdown]);

  const { modal, handleClick, closeModal } = useLocalMediaClick();

  const showStreamingContent = isStreaming && useStreamingContent;

  // Always render streaming container when isStreaming so refs are attached
  // before first augment arrives. Hidden until useStreamingContent becomes true.
  const renderStreamingContainer = isStreaming;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click handler intercepts local media links only
    <div
      className={`text-block timeline-item${isStreaming ? " streaming" : ""}`}
      onClick={handleClick}
    >
      {/* Always render streaming elements when streaming so refs are ready for augments */}
      {renderStreamingContainer && (
        <div style={showStreamingContent ? undefined : { display: "none" }}>
          <div
            ref={streamingMarkdown.containerRef}
            className="streaming-blocks"
          />
          <span
            ref={streamingMarkdown.pendingRef}
            className="streaming-pending"
          />
        </div>
      )}

      {/* Show fallback content when not actively streaming */}
      {!showStreamingContent &&
        (augmentHtml ? (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered HTML
          <div dangerouslySetInnerHTML={{ __html: augmentHtml }} />
        ) : (
          // Plain text fallback (no server augment available)
          <p>{text}</p>
        ))}
      {modal && (
        <LocalMediaModal
          path={modal.path}
          mediaType={modal.mediaType}
          onClose={closeModal}
        />
      )}
    </div>
  );
});
