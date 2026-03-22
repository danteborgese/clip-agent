const { Client } = require("@notionhq/client");

function getNotionClient() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_CLIPS_DB_ID) {
    throw new Error("NOTION_TOKEN and NOTION_CLIPS_DB_ID must be set");
  }
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  return { notion, dbId: process.env.NOTION_CLIPS_DB_ID };
}

function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  if (h > 0) {
    return `${h}:${two(m)}:${two(s)}`;
  }
  return `${m}:${two(s)}`;
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size <= 0) return "0 MB";
  const mb = size / (1024 * 1024);
  if (mb < 1) {
    const kb = size / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

async function createNotionClipPage({
  title,
  description,
  sourceUrl,
  driveLink,
  metadata,
  candidates,
  tags,
  clipDurationSeconds,
  fileSizeBytes,
}) {
  const { notion, dbId } = getNotionClient();

  const props = {
    Name: {
      title: [{ type: "text", text: { content: title || metadata?.title || "Untitled clip" } }],
    },
    Status: {
      status: { name: "Needs approval" },
    },
    "Source URL": {
      url: sourceUrl,
    },
    "Clip URL": {
      url: driveLink,
    },
  };

  if (Array.isArray(tags) && tags.length > 0) {
    props.Tags = {
      multi_select: tags.map((t) => ({
        name: t,
      })),
    };
  }

  if (typeof clipDurationSeconds === "number" && !Number.isNaN(clipDurationSeconds)) {
    props["Clip length"] = {
      rich_text: [
        {
          type: "text",
          text: { content: formatSeconds(clipDurationSeconds) },
        },
      ],
    };
  }

  if (typeof fileSizeBytes === "number" && !Number.isNaN(fileSizeBytes)) {
    props["File size"] = {
      rich_text: [
        {
          type: "text",
          text: { content: formatBytes(fileSizeBytes) },
        },
      ],
    };
  }

  if (description) {
    props.Description = {
      rich_text: [{ type: "text", text: { content: description } }],
    };
  }

  const attribution =
    metadata?.channel || metadata?.podcastTitle
      ? `From: ${metadata.channel || metadata.podcastTitle}`
      : null;

  if (attribution) {
    props.Attribution = {
      rich_text: [{ type: "text", text: { content: attribution } }],
    };
  }

  const children = [];

  if (Array.isArray(candidates) && candidates.length > 0) {
    children.push({
      object: "block",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: "Clip candidates" },
          },
        ],
      },
    });

    const sorted = [...candidates].sort((a, b) => {
      const scoreA = typeof a.score === "number" ? a.score : 0;
      const scoreB = typeof b.score === "number" ? b.score : 0;
      return scoreB - scoreA;
    });

    sorted.forEach((c, idx) => {
      const startLabel = formatSeconds(c.start_seconds);
      const endLabel = formatSeconds(c.end_seconds);
      const scoreLabel =
        typeof c.score === "number" && !Number.isNaN(c.score)
          ? ` (score ${c.score})`
          : "";

      const headerText = `[${idx === 0 ? "Selected" : `Option ${idx + 1}`}] ${startLabel}–${endLabel}${scoreLabel} — ${c.title}`;

      children.push({
        object: "block",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: headerText },
              annotations: idx === 0 ? { bold: true } : {},
            },
          ],
        },
      });

      if (c.description) {
        children.push({
          object: "block",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: `Description: ${c.description}` },
              },
            ],
          },
        });
      }

      if (c.reason) {
        children.push({
          object: "block",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: `Why this works: ${c.reason}` },
              },
            ],
          },
        });
      }
    });
  }

  const page = await notion.pages.create({
    parent: { database_id: dbId },
    properties: props,
    children,
  });

  return page.id;
}

module.exports = {
  createNotionClipPage,
};
