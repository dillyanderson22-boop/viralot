/**
 * Higgsfield SDK smoke test: one Seedance 2.5 text-to-video render (billable).
 *
 *   npm run hf:example
 *
 * Reads HF_CREDENTIALS ("key-id:key-secret") from .env.local via Node's
 * --env-file. The value is never printed.
 */
import { AuthenticationError, NotEnoughCreditsError, config, higgsfield } from "@higgsfield/client/v2";

const credentials = process.env.HF_CREDENTIALS?.trim();
if (!credentials || !credentials.includes(":")) {
  console.error("HF_CREDENTIALS is missing from .env.local (expected key-id:key-secret).");
  process.exit(1);
}

config({ credentials });

try {
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: { prompt: "A cinematic scene at sunset", duration: 5, resolution: "720p", aspect_ratio: "16:9" },
    withPolling: true,
  });
  const status = String(result.status);
  if (status === "completed" && result.video?.url) {
    console.log(`completed (request ${result.request_id})`);
    console.log(result.video.url);
  } else {
    const why = status === "nsfw" ? "rejected by moderation" : status === "completed" ? "completed but returned no video URL" : status;
    console.error(`Generation did not succeed: ${why} (request ${result.request_id})`);
    process.exit(1);
  }
} catch (e) {
  if (e instanceof AuthenticationError) console.error("Higgsfield rejected the credentials (401). Check HF_CREDENTIALS.");
  else if (e instanceof NotEnoughCreditsError) console.error("Not enough Higgsfield API credits (403).");
  else console.error(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
