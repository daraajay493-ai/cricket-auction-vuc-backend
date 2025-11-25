import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage (simple – data resets if server restarts)
const tournaments = {};
const teams = {};
const players = {};
const auctionState = {};

// Create tournament (controller portal)
app.post("/tournaments", (req, res) => {
  const {
    name,
    organizer,
    dateOfAuction,
    numTeams,
    budgetPerTeam
  } = req.body;

  const tournamentId = uuid();
  const controllerId = "CTRL-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const controllerPassword = Math.random().toString(36).substring(2, 8).toUpperCase();
  const viewerCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  tournaments[tournamentId] = {
    id: tournamentId,
    name,
    organizer,
    dateOfAuction,
    numTeams,
    budgetPerTeam,
    controllerId,
    controllerPassword,
    viewerCode
  };

  teams[tournamentId] = [];
  players[tournamentId] = [];
  auctionState[tournamentId] = {
    currentPlayerId: null,
    currentBidAmount: 0,
    status: "idle"
  };

  res.json({
    tournamentId,
    controllerId,
    controllerPassword,
    viewerCode
  });
});

// Controller login
app.post("/auth/controller/login", (req, res) => {
  const { controllerId, password } = req.body;
  const t = Object.values(tournaments).find(
    (t) => t.controllerId === controllerId && t.controllerPassword === password
  );
  if (!t) return res.status(401).json({ error: "Invalid controller credentials" });
  res.json({ ok: true, tournamentId: t.id });
});

// Viewer login
app.post("/auth/viewer/login", (req, res) => {
  const { viewerCode } = req.body;
  const t = Object.values(tournaments).find((t) => t.viewerCode === viewerCode);
  if (!t) return res.status(401).json({ error: "Invalid viewer code" });
  res.json({ viewer: true, tournamentId: t.id });
});

// Teams CRUD (simple)
app.post("/teams/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  if (!teams[tournamentId]) return res.status(404).json({ error: "Tournament not found" });
  const team = {
    id: uuid(),
    name: req.body.name,
    ownerName: req.body.ownerName,
    budgetTotal: req.body.budgetTotal,
    budgetRemaining: req.body.budgetTotal
  };
  teams[tournamentId].push(team);
  res.json(team);
});

app.get("/teams/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  res.json(teams[tournamentId] || []);
});

// Players CRUD (simple)
app.post("/players/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  if (!players[tournamentId]) return res.status(404).json({ error: "Tournament not found" });
  const player = {
    id: uuid(),
    name: req.body.name,
    role: req.body.role,
    basePrice: req.body.basePrice,
    soldPrice: null,
    soldToTeamId: null,
    status: "unsold",
    photoUrl: req.body.photoUrl || null
  };
  players[tournamentId].push(player);
  res.json(player);
});

app.get("/players/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  res.json(players[tournamentId] || []);
});

// Auction state
app.get("/auction/state/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  const state = auctionState[tournamentId];
  if (!state) return res.status(404).json({ error: "Tournament not found" });
  const currentPlayer =
    players[tournamentId]?.find((p) => p.id === state.currentPlayerId) || null;
  res.json({
    ...state,
    player: currentPlayer
  });
});

// Controller: start auction for a player
app.post("/auction/start/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  const { playerId, startPrice } = req.body;
  if (!auctionState[tournamentId]) return res.status(404).json({ error: "Tournament not found" });
  auctionState[tournamentId].currentPlayerId = playerId;
  auctionState[tournamentId].currentBidAmount = startPrice || 0;
  auctionState[tournamentId].status = "bidding";
  res.json(auctionState[tournamentId]);
});

// Controller: place bid
app.post("/auction/bid/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  const { amount } = req.body;
  if (!auctionState[tournamentId]) return res.status(404).json({ error: "Tournament not found" });
  auctionState[tournamentId].currentBidAmount += amount;
  res.json(auctionState[tournamentId]);
});

// Controller: sell player
app.post("/auction/sell/:tournamentId", (req, res) => {
  const { tournamentId } = req.params;
  const { teamId } = req.body;
  const state = auctionState[tournamentId];
  if (!state) return res.status(404).json({ error: "Tournament not found" });

  const pls = players[tournamentId];
  const tms = teams[tournamentId];
  const player = pls.find((p) => p.id === state.currentPlayerId);
  const team = tms.find((t) => t.id === teamId);
  if (!player || !team) return res.status(400).json({ error: "Invalid team or player" });

  player.status = "sold";
  player.soldPrice = state.currentBidAmount;
  player.soldToTeamId = teamId;
  team.budgetRemaining -= state.currentBidAmount;
  state.status = "sold";

  res.json({ state, player, team });
});

// Simple about route (for testing)
app.get("/", (req, res) => {
  res.send("Cricket auction backend is running.");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
