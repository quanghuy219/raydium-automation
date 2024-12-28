import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { RaydiumAutomation } from "../target/types/raydium_automation";
import {
  Keypair, PublicKey, SystemProgram,
} from "@solana/web3.js";
import {
  MINT_SIZE, createInitializeMint2Instruction, getAssociatedTokenAddressSync,
  createMintToInstruction,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { buildTransaction, wait } from "./helper";

describe("raydium-automation", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.RaydiumAutomation as Program<RaydiumAutomation>;
  const provider = anchor.AnchorProvider.env();
  const payer = provider.wallet;
  const user = Keypair.generate();
  const tokenMint = Keypair.generate();

  console.log("user:", user.publicKey.toBase58());

  it("should create PDA global account with owner data", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("globalState")],
      program.programId
    );
    console.log("globalState PDA:", pda.toBase58());

    const globalStateAccountInfo = await provider.connection.getAccountInfo(pda);

    if (globalStateAccountInfo == null) {
      // Create the PDA account
      const tx = await program.methods
        .initializeGlobalState()
        .accounts({
          payer: payer.publicKey,
          globalState: pda,
          admin: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Create Global State PDA signature", tx);
    }

    const globalStateAccount = await program.account.globalState.fetch(pda);

    expect(globalStateAccount.admin.toBase58()).to.equal(payer.publicKey.toBase58());
    const operators = globalStateAccount.operators.map(operator => operator.toBase58());
    expect(operators).to.include(payer.publicKey.toBase58());
    expect(globalStateAccount.bump).to.equal(bump);
  })

  it("should create PDA account with owner data if needed", async () => {

    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.publicKey.toBuffer()],
      program.programId
    );

    const pdaAccountInfo = await provider.connection.getAccountInfo(pda);
    if (pdaAccountInfo == null) {
      // Create the PDA account
      const tx = await program.methods
        .initializeUserPda()
        .accounts({
          payer: payer.publicKey,
          owner: user.publicKey,
          userVault: pda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Create PDA signature", tx);
    }

    const userVault = await program.account.userPdaVaultAccount.fetch(pda);
    expect(userVault.owner.toBase58()).to.equal(user.publicKey.toBase58());
    expect(userVault.bump).to.equal(bump);
  });

  it("should create SPL token and mint token to user vault", async () => {
    console.log("tokenMint", tokenMint.publicKey.toBase58());

    const tokenConfig = {
      decimals: 9,
      name: "My USD",
      symbol: "mUSD",
    }

    const createMintInstruction = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: tokenMint.publicKey,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE),
      space: MINT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMintInstruction = createInitializeMint2Instruction(
      tokenMint.publicKey,
      tokenConfig.decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_2022_PROGRAM_ID,
    );

    const [userVaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.publicKey.toBuffer()],
      program.programId
    );
    const pdaATA = getAssociatedTokenAddressSync(tokenMint.publicKey, userVaultPda, true, TOKEN_2022_PROGRAM_ID);
    const createATA = createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, pdaATA, userVaultPda, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID);
    const balance = 1000;
    const mintToIx = createMintToInstruction(tokenMint.publicKey, pdaATA, payer.publicKey, balance, [], TOKEN_2022_PROGRAM_ID);
    const instructions = [
      createMintInstruction,
      initializeMintInstruction,
      createATA,
      mintToIx,
    ];

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [tokenMint],
      instructions,
    });
    const signedTx = await payer.signTransaction(tx);

    const txSig = await provider.connection.sendTransaction(signedTx);
    console.log("Create Mint signature", txSig);

    await wait(3000);

    const accountInfo = await provider.connection.getAccountInfo(pdaATA);
    expect(accountInfo).to.not.be.null;
    const userVaultAccount = await provider.connection.getTokenAccountBalance(pdaATA);
    expect(userVaultAccount.value.amount).to.equal(balance.toString());
  });

  it("should transfer sol successfully", async () => {
    const userPublicKey = user.publicKey;
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), userPublicKey.toBuffer()],
      program.programId
    );

    // ========= Transfer SOL =========
    const setupSolIx = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: pda,
      lamports: 1,
    })

    const setupTx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [],
      instructions: [setupSolIx],
    })
    const signedSetupTx = await payer.signTransaction(setupTx);

    const sendTxSig = await provider.sendAndConfirm(signedSetupTx);
    console.log("Setup transaction signature", sendTxSig);
    // ==================

    // Transfer 1 lamport to the user
    const transferByAdminIx = await program.methods
      .transferLamports(new BN(1))
      .accounts({
        user: payer.publicKey,
        userVault: pda,
        to: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const transferByAdminTx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [],
      instructions: [transferByAdminIx],
    });
    const signedTransferByAdminTx = await payer.signTransaction(transferByAdminTx);

    const simulateTransferByAdminResult = await provider.connection.simulateTransaction(signedTransferByAdminTx);
    console.log("simulateTransferByAdminResult", simulateTransferByAdminResult.value.err);
    expect(simulateTransferByAdminResult.value.err).to.not.be.null;

    // Transfer 1 lamport to the user
    const transferLamportsIx = await program.methods
      .transferLamports(new BN(1))
      .accounts({
        user: user.publicKey,
        userVault: pda,
        to: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const transferTx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [user],
      instructions: [transferLamportsIx],
    });
    const signedTx = await payer.signTransaction(transferTx);

    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;

    const txSig = await provider.connection.sendTransaction(signedTx);
    console.log("transfer sol transaction signature", txSig);
  });

  it("should transfer spl token by owner successfully", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.publicKey.toBuffer()],
      program.programId
    );

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .transferToken(new BN(1))
      .accounts({
        user: user.publicKey,
        userVault: pda,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();
    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [user],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });

  it("should fail to transfer token by non-operator", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.publicKey.toBuffer()],
      program.programId
    );

    const operator = Keypair.generate();

    const [globalState, globalStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("globalState")],
      program.programId
    );

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .transferByOperator(new BN(1))
      .accounts({
        operator: operator.publicKey,
        user: user.publicKey,
        userVault: pda,
        globalState: globalState,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [operator],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    console.log("simulateResult", simulateResult.value.err);
    expect(simulateResult.value.err).to.not.be.null;
  })

  it("should transfer spl token by operator successfully", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.publicKey.toBuffer()],
      program.programId
    );

    const [globalState, globalStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("globalState")],
      program.programId
    );

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .transferByOperator(new BN(1))
      .accounts({
        operator: payer.publicKey,
        user: user.publicKey,
        userVault: pda,
        globalState: globalState,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });

  it("should withdraw token by operator successfully", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.publicKey.toBuffer()],
      program.programId
    );

    const [globalState, globalStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("globalState")],
      program.programId
    );

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .withdrawTokenByOperator()
      .accounts({
        operator: payer.publicKey,
        user: user.publicKey,
        userVault: pda,
        globalState: globalState,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });

  it("should approve and revoke approval successfully", async () => {

    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.publicKey.toBuffer()],
      program.programId
    );

    const tokenAccount = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);

    const delegate = payer.publicKey;

    const approveIx = await program.methods
      .approveToken(new BN(10))
      .accounts({
        user: user.publicKey,
        userVault: pda,
        tokenAccount: tokenAccount,
        delegate: delegate,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const revokeIx = await program.methods
      .revokeApproval()
      .accounts({
        user: user.publicKey,
        userVault: pda,
        tokenAccount: tokenAccount,
        delegate: delegate,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const instructions = [
      approveIx,
      revokeIx,
    ];

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: instructions,
      signers: [],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });
});
