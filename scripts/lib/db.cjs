const { supabase } = require("./supabaseClient.cjs");

async function getJobById(id) {
  const { data, error } = await supabase.from("jobs").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function updateJob(id, patch) {
  const { data, error } = await supabase
    .from("jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function insertCandidatesForJob(jobId, candidates) {
  if (!candidates || candidates.length === 0) return [];

  const rows = candidates.map((c) => ({
    job_id: jobId,
    start_seconds: c.start_seconds,
    end_seconds: c.end_seconds,
    title: c.title,
    description: c.description,
    reason: c.reason,
    score: typeof c.score === "number" ? c.score : null,
  }));

  const { data, error } = await supabase.from("candidates").insert(rows).select("*");
  if (error) throw error;
  return data;
}

module.exports = {
  getJobById,
  updateJob,
  insertCandidatesForJob,
};
