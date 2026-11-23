import type { Show, Update } from "@blue-orchid/domain";

import type { Message } from "../chat/Message.ts";

const releaseLabel = (update: Update): string => {
  const { episode, kind, region } = update.change.release;
  return `Episode ${episode} · ${kind} · ${region}`;
};

export const updateMessage = (show: Show, update: Update): Message => {
  switch (update.change._tag) {
    case "EpisodeScheduled":
      return {
        text: `New episode scheduled for ${show.title}.`,
        entries: [
          { title: show.title, detail: releaseLabel(update), at: update.change.release.airsAt, previousAt: null },
        ],
      };
    case "EpisodeRescheduled":
      return {
        text: `${show.title} has a new time.`,
        entries: [
          {
            title: show.title,
            detail: releaseLabel(update),
            at: update.change.release.airsAt,
            previousAt: update.change.previousAirsAt,
          },
        ],
      };
  }
};
