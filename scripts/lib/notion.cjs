const { Client } = require("@notionhq/client");

function getNotionClient() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_CLIPS_DB_ID) {
    throw new Error("NOTION_TOKEN and NOTION_CLIPS_DB_ID must be set");
  }
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  return { notion, dbId: process.env.NOTION_CLIPS_DB_ID };
}

async function createNotionClipPage({ title, description, sourceUrl, driveLink, metadata }) {
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

  const page = await notion.pages.create({
    parent: { database_id: dbId },
    properties: props,
  });

  return page.id;
}

module.exports = {
  createNotionClipPage,
};
