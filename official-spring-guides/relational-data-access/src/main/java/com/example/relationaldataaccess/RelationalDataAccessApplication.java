package com.example.relationaldataaccess;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootApplication
public class RelationalDataAccessApplication implements CommandLineRunner {

  static final Logger logger = LoggerFactory.getLogger(RelationalDataAccessApplication.class);

  @Autowired JdbcTemplate jdbcTemplate;

  public static void main(String[] args) {
    SpringApplication.run(RelationalDataAccessApplication.class, args);
  }

  @Override
  public void run(String... args) throws Exception {
    logger.info("Creating tables:");

    jdbcTemplate.execute("DROP TABLE customer IF EXISTS");
    jdbcTemplate.execute(
        "CREATE TABLE customers (id SERIAL, first_name VARCHAR(255), last_name VARCHAR(255))");
    List<Object[]> splitUpNames =
        Arrays.asList("John Woo", "Jeff Dean", "Josh Bloch", "Josh Long").stream()
            .map(name -> name.split(" "))
            .collect(Collectors.toList());
    splitUpNames.forEach(
        name ->
            logger.info(String.format("Inserting customer record for %s %s", name[0], name[1])));
    jdbcTemplate.batchUpdate(
        "INSERT INTO customers(first_name, last_name) VALUES (?, ?)", splitUpNames);
    logger.info("Querying for customers named Josh");
    jdbcTemplate
        .query(
            "SELECT id, first_name, last_name FROM customers WHERE first_name = ?",
            new Object[] {"Josh"},
            (resultSet, rowNumber) ->
                new Customer(
                    resultSet.getLong("id"),
                    resultSet.getString("first_name"),
                    resultSet.getString("last_name")))
        .forEach(customer -> logger.info(customer.toString()));
  }
}
