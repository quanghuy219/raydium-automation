import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { RaydiumAutomation } from "../target/types/raydium_automation";
import {
  Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction,
  TransactionMessage,
  VersionedTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, MINT_SIZE, createInitializeMint2Instruction, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction, createMintToInstruction,
  AccountLayout, createInitializeAccountInstruction, createSetAuthorityInstruction, AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction
} from "@solana/spl-token";

// ProgramId: AgR4NKt497J87UdrE8AoX1559BboqxQ5mbfo7ohc1Hu2

describe("raydium-automation", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.RaydiumAutomation as Program<RaydiumAutomation>;
  console.log("Program ID:", program.programId.toBase58());

  // it("Is initialized!", async () => {
  //   // Add your test here.
  //   const tx = await program.methods.initialize().rpc();
  //   console.log("Your transaction signature", tx);
  // });

  // it("should create PDA account with owner data", async () => {
  //   const provider = anchor.AnchorProvider.env();
  //   const user = provider.wallet.publicKey;

  //   // Derive the PDA address
  //   const [pda, bump] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("userPdaVault"), user.toBuffer()],
  //     program.programId
  //   );

  //   // Create the PDA account
  //   const tx = await program.methods
  //     .createPda(user, bump)
  //     .accounts({
  //       pdaAccount: pda,
  //       user: user,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .rpc();

  //   console.log("Your transaction signature", tx);

  //   // Fetch the PDA account
  //   const pdaAccount = await program.account.pdaAccount.fetch(pda);

  //   // Verify the owner address
  //   console.log("PDA Account Owner:", pdaAccount.owner.toString());
  //   console.assert(pdaAccount.owner.equals(user), "Owner address mismatch");
  //   console.assert(pdaAccount.bump == bump, "Bump mismatch");
  // });

  // it("should transfer sol successfully", async () => {
  //   const provider = anchor.AnchorProvider.env();
  //   const user = provider.wallet.publicKey;

  //   // Derive the PDA address
  //   const [pda, bump] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("userPdaVault"), user.toBuffer()],
  //     program.programId
  //   );

  //   // ========= Transfer SOL =========
  //   // let transaction = new Transaction();
  //   // transaction.add(
  //   //   SystemProgram.transfer({
  //   //     fromPubkey: user,
  //   //     toPubkey: pda,
  //   //     lamports: 10,
  //   //   })
  //   // )

  //   // const latestBlockHash = await provider.connection.getLatestBlockhash();
  //   // transaction.recentBlockhash = latestBlockHash.blockhash;
  //   // transaction.feePayer = provider.wallet.publicKey;

  //   // const signedTx = await provider.wallet.signTransaction(transaction);

  //   // const sendTxSig = await provider.sendAndConfirm(signedTx);
  //   // console.log("Your transaction signature", sendTxSig);
  //   // ==================

  //   // Transfer 1 lamport to the user
  //   const transferLamportsTx = await program.methods
  //     .transferLamports(new BN(1))
  //     .accounts({
  //       user: user,
  //       pdaAccount: pda,
  //       to: user,
  //       systemProgram: SystemProgram.programId,
  //     })
  //     .rpc();

  //   console.log("Your transaction signature", transferLamportsTx);
  // });


  it("should transfer spl successfully", async () => {
    const provider = anchor.AnchorProvider.env();
    const user = provider.wallet.publicKey;

    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("userPdaVault"), user.toBuffer()],
      program.programId
    );

    // ========= Create SPL Token =========
    const tokenConfig = {
      decimals: 9,
      name: "My USD",
      symbol: "mUSD",
    }
    const mint = Keypair.generate();
    console.log("Mint address:", mint.publicKey.toBase58());
    const createMintInstruction = SystemProgram.createAccount({
      fromPubkey: user,
      newAccountPubkey: mint.publicKey,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE),
      space: MINT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    });
    const initializeMintInstruction = createInitializeMint2Instruction(
      mint.publicKey,
      tokenConfig.decimals,
      user,
      user,
      TOKEN_2022_PROGRAM_ID,
    );

    // const tokenMint = new PublicKey("9ST2urGdvEkc63ZoPtbRVbz5HJjqR6dkt6rco3HCWhM4");
    const tokenAccount = getAssociatedTokenAddressSync(mint.publicKey, user, false, TOKEN_2022_PROGRAM_ID);
    const createATAInstruction = createAssociatedTokenAccountIdempotentInstruction(user, tokenAccount, user, mint.publicKey, TOKEN_2022_PROGRAM_ID);

    const pdaTokenAccount = getAssociatedTokenAddressSync(mint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const createPdaATAInstruction = createAssociatedTokenAccountIdempotentInstruction(user, pdaTokenAccount, pda, mint.publicKey, TOKEN_2022_PROGRAM_ID);

    const mintToPdaInstruction = createMintToInstruction(
      mint.publicKey,
      pdaTokenAccount,
      user,
      1000,
      [],
      TOKEN_2022_PROGRAM_ID,
    );

    const transferLamportsIx = await program.methods
      .transferSpl(new BN(1))
      .accounts({
        user: user,
        pdaAccount: pda,
        fromAta: pdaTokenAccount,
        toAta: tokenAccount,
        mint: mint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const instructions = [
      createMintInstruction,
      initializeMintInstruction,
      createPdaATAInstruction,
      mintToPdaInstruction,
      createATAInstruction,
      transferLamportsIx,
    ];

    const latestBlockHash = await provider.connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: provider.wallet.publicKey,
      recentBlockhash: latestBlockHash.blockhash,
      instructions: instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    const signedTx = await provider.wallet.signTransaction(transaction);

    const simulateRes = await provider.connection.simulateTransaction(signedTx, {sigVerify: false});
    console.log(simulateRes);

    // const sendTxSig = await provider.sendAndConfirm(signedTx, [mint]);
    // console.log("Your transaction signature", sendTxSig);
    // ==================

    // Transfer 1 lamport to the user
    // const transferLamportsIx = await program.methods
    //   .transferSpl(new BN(1))
    //   .accounts({
    //     user: user,
    //     pdaAccount: pda,
    //     fromAta: pdaTokenAccount,
    //     toAta: tokenAccount,
    //     tokenProgram: TOKEN_2022_PROGRAM_ID
    //   })
    //   .instruction();

    // console.log("Your transaction signature", transferLamportsTx);
  });

  // it("should invoke swap", async () => {
  //   const provider = anchor.AnchorProvider.env();

  //   const user = provider.wallet.publicKey;

  //   // Derive the PDA address
  //   const [pda, bump] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("userPdaVault"), user.toBuffer()],
  //     program.programId
  //   );

  //   console.log(user.toBase58());
  //   console.log(pda.toBase58());
  // })

  // it("should withdraw token successfully", async () => {
  //   const provider = anchor.AnchorProvider.env();
  //   const user = provider.wallet.publicKey;

  //   // Derive the PDA address
  //   const [pda, bump] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("userPdaVault"), user.toBuffer()],
  //     program.programId
  //   );

  //   // ========= Create SPL Token =========
  //   const tokenConfig = {
  //     decimals: 9,
  //     name: "Myyyy USD",
  //     symbol: "mmmmUSD",
  //   }
  //   const mint = Keypair.generate();

  //   console.log("Mint address:", mint.publicKey.toBase58());

  //   const createMintInstruction = SystemProgram.createAccount({
  //     fromPubkey: user,
  //     newAccountPubkey: mint.publicKey,
  //     lamports: await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE),
  //     space: MINT_SIZE,
  //     programId: TOKEN_PROGRAM_ID,
  //   });
  //   const initializeMintInstruction = createInitializeMint2Instruction(
  //     mint.publicKey,
  //     tokenConfig.decimals,
  //     user,
  //     user,
  //   );

  //   const tokenAccountKeypair = Keypair.generate();
  //   const tokenAccount = tokenAccountKeypair.publicKey;
  //   const lamports = await provider.connection.getMinimumBalanceForRentExemption(165);

  //   const createInitializeAccountIns = createInitializeAccountInstruction(
  //     tokenAccount, mint.publicKey, user, TOKEN_PROGRAM_ID,
  //   )
  //   const createTokenAccountInstruction = SystemProgram.createAccount({
  //     fromPubkey: user,
  //     newAccountPubkey: tokenAccount,
  //     space: 165,
  //     lamports,
  //     programId: TOKEN_PROGRAM_ID,
  //   });

  //   // const tokenMint = new PublicKey("9ST2urGdvEkc63ZoPtbRVbz5HJjqR6dkt6rco3HCWhM4");
  //   // const tokenAccount = getAssociatedTokenAddressSync(tokenMint, pda);

  //   // const pdaTokenAccount = getAssociatedTokenAddressSync(tokenMint, pda, true);
  //   // const createPdaATAInstruction = createAssociatedTokenAccountInstruction(user, pdaTokenAccount, pda, mint.publicKey);

  //   const mintToUserInstruction = createMintToInstruction(
  //     mint.publicKey,
  //     tokenAccount,
  //     user,
  //     1000
  //   );

  //   const transferOwnershipInstruction = createSetAuthorityInstruction(
  //     tokenAccount, user, AuthorityType.AccountOwner, pda,
  //   );
  //   const userAta = getAssociatedTokenAddressSync(mint.publicKey, user);

  //   console.log("User ATA:", userAta.toBase58());
  
  //   const createUserATAInstruction = createAssociatedTokenAccountInstruction(
  //     user, userAta, user, mint.publicKey
  //   );

  //   // Transfer 1 lamport to the user
  //   const withdrawTokenTx = await program.methods
  //     .withdrawTokenAndClose()
  //     .accounts({
  //       user: user,
  //       fromTokenAccount: tokenAccount,
  //       toTokenAccount: userAta,
  //       destination: user,
  //     })
  //     .instruction();
  
  //   const instructions = [
  //     createMintInstruction,
  //     initializeMintInstruction,
  //     createTokenAccountInstruction,
  //     createInitializeAccountIns,
  //     mintToUserInstruction,
  //     transferOwnershipInstruction,
  //     createUserATAInstruction,
  //     withdrawTokenTx
  //   ];

  //   let transaction = new Transaction();
  //   transaction.add(...instructions);

  //   const latestBlockHash = await provider.connection.getLatestBlockhash();
  //   transaction.recentBlockhash = latestBlockHash.blockhash;
  //   transaction.feePayer = user;

  //   const signedTx = await provider.wallet.signTransaction(transaction);

  //   const sendTxSig = await provider.sendAndConfirm(signedTx, [mint, tokenAccountKeypair]);
  //   console.log("Your transaction signature", sendTxSig);
  // });
});
