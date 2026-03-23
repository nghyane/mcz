use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "mcz", about = "MCZ — Manga Container Format")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Pack a directory of images into MCZ
    Pack {
        /// Input directory
        dir: PathBuf,
        /// Output file
        #[arg(short, long)]
        output: PathBuf,
        /// WebP quality (1-100). Auto-passthrough if source is already smaller
        #[arg(short, long, default_value = "80")]
        quality: u8,
        /// Prepend WebP cover (polyglot format — detected as image/webp)
        #[arg(long, default_value = "false")]
        cover: bool,
    },
    /// Show MCZ file info
    Info {
        /// MCZ file
        file: PathBuf,
    },
    /// Extract a single page from MCZ
    Extract {
        /// MCZ file
        file: PathBuf,
        /// Page index (0-based)
        page: usize,
        /// Output file
        #[arg(short, long)]
        output: PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Command::Pack { dir, output, quality, cover } => cmd_pack(&dir, &output, quality, cover),
        Command::Info { file } => cmd_info(&file),
        Command::Extract { file, page, output } => cmd_extract(&file, page, &output),
    }
}

fn cmd_pack(dir: &PathBuf, output: &PathBuf, quality: u8, cover: bool) {
    match mcz::pack_dir(dir, output, quality, cover) {
        Ok(index) => {
            println!("Packed {} pages → {}", index.pages.len(), output.display());
            let total: u64 = index.pages.iter().map(|p| p.size as u64).sum();
            println!("Total size: {} bytes", total + mcz::MCZIndex::data_offset(index.pages.len() as u16) as u64);
            for p in &index.pages {
                println!("  {:>3}: {:>4}×{:<4} {:>4} {:>8} bytes",
                    p.index, p.width, p.height, p.format, p.size);
            }
        }
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    }
}

fn cmd_info(file: &PathBuf) {
    let data = match std::fs::read(file) {
        Ok(d) => d,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    match mcz::read_index(&data) {
        Ok(index) => {
            let total: u64 = index.pages.iter().map(|p| p.size as u64).sum();
            println!("MCZ v{} — {} pages, {} bytes", index.version, index.pages.len(), data.len());
            println!("Index size: {} bytes", mcz::MCZIndex::data_offset(index.pages.len() as u16));
            println!("Data size:  {} bytes", total);
            println!();
            for p in &index.pages {
                println!("  {:>3}: {:>4}×{:<4} {:>4}  offset={:<8} size={}",
                    p.index, p.width, p.height, p.format, p.offset, p.size);
            }
        }
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    }
}

fn cmd_extract(file: &PathBuf, page: usize, output: &PathBuf) {
    let data = match std::fs::read(file) {
        Ok(d) => d,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    let index = match mcz::read_index(&data) {
        Ok(i) => i,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    match mcz::extract_page(&data, &index, page) {
        Ok(page_data) => {
            if let Err(e) = std::fs::write(output, page_data) {
                eprintln!("error: {e}"); std::process::exit(1);
            }
            let info = &index.pages[page];
            println!("Extracted page {} ({}×{} {}) → {}", page, info.width, info.height, info.format, output.display());
        }
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    }
}
